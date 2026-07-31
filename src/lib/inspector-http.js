import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { AppError, formatError } from "./errors.js";
import { inspectPublicCredential } from "./public-inspector.js";
import { buildLearningOverview } from "./learning-progress.js";
import { verifyPublicProof } from "./proof-verifier.js";
import { decodeRevocationRecordJson } from "./revocation-binary.js";

const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;
const JSON_CONTENT_TYPE = /^application\/json(?:\s*;.*)?$/i;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

export function securityHeaders() {
  return {
    "content-security-policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY"
  };
}

function writeHeaders(response, status, headers = {}) {
  response.writeHead(status, { ...securityHeaders(), ...headers });
}

export function sendJson(response, status, value, requestId) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  writeHeaders(response, status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    ...(requestId ? { "x-request-id": requestId } : {})
  });
  response.end(body);
}

export function readJsonBody(request, maxBodyBytes = DEFAULT_MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    if (!JSON_CONTENT_TYPE.test(request.headers["content-type"] ?? "")) {
      reject(new AppError("CONTENT_TYPE_INVALID", "Content-Type must be application/json."));
      return;
    }
    const chunks = [];
    let total = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBodyBytes) {
        fail(new AppError("REQUEST_TOO_LARGE", `Request exceeds ${maxBodyBytes} bytes.`));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (settled) return;
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        settled = true;
        resolve(parsed);
      } catch {
        fail(new AppError("JSON_INVALID", "Request body must be valid JSON."));
      }
    });
    request.on("error", fail);
  });
}

export function safeStaticPath(publicDir, urlPath) {
  const requested = urlPath === "/" ? "/index.html" : urlPath;
  let decoded;
  try {
    decoded = decodeURIComponent(requested);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const absolute = path.resolve(publicDir, `.${decoded}`);
  const relative = path.relative(publicDir, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return absolute;
}

function decodeStrictBase64(value, maxDecodedBytes) {
  if (typeof value !== "string" || value.length === 0) return undefined;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new AppError("DOCUMENT_BASE64_INVALID", "documentBase64 must be canonical base64 without whitespace.");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length === 0) throw new AppError("DOCUMENT_INVALID", "Uploaded document is empty.");
  if (bytes.length > maxDecodedBytes) {
    throw new AppError("DOCUMENT_TOO_LARGE", `Decoded document exceeds ${maxDecodedBytes} bytes.`);
  }
  return bytes;
}

async function inspectFromRequest({ body, config, inspectCredential, maxDocumentBytes }) {
  const credentialId = typeof body.credentialId === "string" ? body.credentialId.trim() : "";
  if (!credentialId) throw new AppError("CREDENTIAL_ID_INVALID", "credentialId is required.");
  if (credentialId.length > 256) throw new AppError("CREDENTIAL_ID_TOO_LONG", "credentialId must be at most 256 characters.");

  let temporaryDocument;
  try {
    const bytes = decodeStrictBase64(body.documentBase64, maxDocumentBytes);
    if (bytes) {
      temporaryDocument = path.join(os.tmpdir(), `ckb-degree-${crypto.randomUUID()}.bin`);
      fs.writeFileSync(temporaryDocument, bytes, { mode: 0o600, flag: "wx" });
    }
    return await inspectCredential(config, credentialId, {
      documentPath: temporaryDocument,
      skipChain: body.skipChain === true
    });
  } finally {
    if (temporaryDocument) fs.rmSync(temporaryDocument, { force: true });
  }
}

export function createInspectorServer(options) {
  const {
    config,
    publicDir,
    inspectCredential = inspectPublicCredential,
    maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
    maxDocumentBytes = Math.min(maxBodyBytes, 8 * 1024 * 1024),
    logger = console,
    learningOverview = () => buildLearningOverview(config.ROOT_DIR ?? path.resolve(publicDir, ".."))
  } = options;
  if (!config || !publicDir) throw new Error("config and publicDir are required.");

  return http.createServer(async (request, response) => {
    const requestId = crypto.randomUUID();
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, {
          ok: true,
          service: "CKB Degree Proof Public Credential Inspector",
          version: "2.4.0",
          network: config.APP_NETWORK,
          readOnly: true,
          privateKeyRequired: false,
          communityFormats: ["ckb-degree-credential-cell/v1", "ckb-degree-public-verification-proof/v2"]
        }, requestId);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/learning") {
        sendJson(response, 200, learningOverview(), requestId);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/inspect") {
        const body = await readJsonBody(request, maxBodyBytes);
        const proof = await inspectFromRequest({ body, config, inspectCredential, maxDocumentBytes });
        sendJson(response, 200, proof, requestId);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/decode-cell") {
        const body = await readJsonBody(request, maxBodyBytes);
        const decoded = decodeRevocationRecordJson(body.cellData, {
          expectedCredentialHash: body.expectedCredentialHash,
          expectedIssuerLockHash: body.expectedIssuerLockHash
        });
        sendJson(response, decoded.canonical ? 200 : 422, decoded, requestId);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/verify-proof") {
        const body = await readJsonBody(request, maxBodyBytes);
        const result = verifyPublicProof(body.proof ?? body);
        sendJson(response, result.valid ? 200 : 422, result, requestId);
        return;
      }

      if (request.method !== "GET") {
        sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "This route does not support the requested method." }, requestId);
        return;
      }

      const filePath = safeStaticPath(publicDir, url.pathname);
      if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        sendJson(response, 404, { error: "NOT_FOUND" }, requestId);
        return;
      }
      const body = fs.readFileSync(filePath);
      writeHeaders(response, 200, {
        "content-type": contentTypes[path.extname(filePath)] ?? "application/octet-stream",
        "content-length": body.length,
        "cache-control": filePath.endsWith("index.html") ? "no-store" : "public, max-age=300",
        "x-request-id": requestId
      });
      response.end(body);
    } catch (error) {
      logger.error?.(formatError(error));
      const known = error instanceof AppError;
      const status = error?.code === "REQUEST_TOO_LARGE" || error?.code === "DOCUMENT_TOO_LARGE" ? 413
        : error?.code === "CONTENT_TYPE_INVALID" ? 415
          : 400;
      sendJson(response, status, {
        error: known ? error.code : "INSPECTION_FAILED",
        message: known ? error.message : "Inspection failed. Check the request, public credential data, and RPC configuration."
      }, requestId);
    }
  });
}
