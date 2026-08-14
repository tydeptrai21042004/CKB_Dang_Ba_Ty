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
import { aiAgentCatalog, aiProviderCatalog, analyzeCredentialDocument, analyzeEvidence, explainVerification, runCkbAgent, tutor } from "./ai-service.js";
import { aiPluginCatalog } from "./plugin-service.js";
import { ckbApplicationCatalog, runCkbApplication } from "./application-service.js";
import { agentServiceCatalog, createAgentServiceAgreement, createFiberPaymentQuote, getAgentService, runAgentService, verifyAgentJobReceipt } from "./agent-commerce-service.js";
import { getAgentJob, recordAgentJob, serviceReputation } from "./agent-job-store.js";
import { agentRuntimeDoctor, runCkbTransactionPreflight } from "./agent-ops-service.js";
import { createSubmission, getTrackedSubmission, getTrackedSubmissionWithTimeline, resubmitTrackedSubmission, cancelTrackedSubmission } from "./product-db.js";
import { getPassport } from "./passport-service.js";
import { loadLedger } from "./ledger.js";
import { portableCredential } from "./credential-artifact.js";
import { qrSvg } from "./qr-service.js";
import { verifyEvidenceReferences } from "./evidence-checks.js";
import { getPublicStats, listPublicCredentials } from "./directory-service.js";
import { decodeCanonicalBase64, inspectDocumentInput, supportedDocumentTypes } from "./document-service.js";
import { listAttachmentMetadata, removeSubmissionAttachment, storeSubmissionAttachment } from "./attachment-service.js";
import { credentialHtml } from "./credential-html.js";

const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;
const JSON_CONTENT_TYPE = /^application\/json(?:\s*;.*)?$/i;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};


function cleanText(value, name, max = 500) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new AppError("INPUT_INVALID", `${name} is required.`);
  if (text.length > max) throw new AppError("INPUT_TOO_LONG", `${name} is too long.`);
  return text;
}
export function validatePublicSubmission(body) {
  const recipientLockHash = cleanText(body.recipientLockHash, "recipientLockHash", 66);
  if (!/^0x[0-9a-fA-F]{64}$/.test(recipientLockHash)) throw new AppError("RECIPIENT_LOCK_HASH_INVALID", "recipientLockHash must be a 32-byte hexadecimal hash.");
  const applicantEmail = cleanText(body.applicantEmail, "applicantEmail", 254);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(applicantEmail)) throw new AppError("EMAIL_INVALID", "Enter a valid email address.");
  const evidence = Array.isArray(body.evidence) ? body.evidence.slice(0, 20).map((value) => cleanText(value, "evidence item", 2000)) : [];
  if (!evidence.length && !String(body.notes ?? "").trim()) throw new AppError("EVIDENCE_REQUIRED", "Provide at least one evidence URL/item or explanatory note.");
  return {
    applicantName: cleanText(body.applicantName, "applicantName", 160), applicantEmail, recipientLockHash,
    credentialType: cleanText(body.credentialType, "credentialType", 80), credentialTitle: cleanText(body.credentialTitle, "credentialTitle", 180),
    category: cleanText(body.category, "category", 120), evidence, notes: String(body.notes ?? "").trim().slice(0, 5000)
  };
}
function validateResubmission(body) {
  const evidence = Array.isArray(body.evidence) ? body.evidence.slice(0, 20).map((value) => cleanText(value, "evidence item", 2000)) : [];
  const notes = String(body.notes ?? "").trim().slice(0, 5000);
  if (!evidence.length && !notes) throw new AppError("EVIDENCE_REQUIRED", "Provide at least one evidence URL/item or explanatory note.");
  return { evidence, notes };
}
function createRateLimiter(limit = 45, windowMs = 60_000) {
  const buckets = new Map();
  return (request, key = "default") => {
    const ip = String(request.headers["x-forwarded-for"] ?? request.socket?.remoteAddress ?? "unknown").split(",")[0].trim();
    const id = `${ip}:${key}`; const ts = Date.now(); const bucket = buckets.get(id);
    if (!bucket || ts - bucket.start > windowMs) { buckets.set(id, { start: ts, count: 1 }); return; }
    bucket.count += 1;
    if (bucket.count > limit) throw new AppError("RATE_LIMITED", "Too many requests. Try again shortly.");
  };
}
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
  const bytes = decodeCanonicalBase64(value);
  if (bytes.length === 0) throw new AppError("DOCUMENT_INVALID", "Uploaded document is empty.");
  if (bytes.length > maxDecodedBytes) throw new AppError("DOCUMENT_TOO_LARGE", `Decoded document exceeds ${maxDecodedBytes} bytes.`);
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
    learningOverview = () => buildLearningOverview(config.ROOT_DIR ?? path.resolve(publicDir, "..")),
    productDb = null,
    aiFetchImpl = fetch,
    toolFetchImpl = fetch
  } = options;
  const rateLimit = createRateLimiter();
  if (!config || !publicDir) throw new Error("config and publicDir are required.");

  return http.createServer(async (request, response) => {
    const requestId = crypto.randomUUID();
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, {
          ok: true,
          service: "CKBuilder Passport Public Verifier",
          version: "9.0.0",
          network: config.APP_NETWORK,
          readOnly: true,
          privateKeyRequired: false,
          communityFormats: ["ckb-degree-credential-cell/v1", "ckb-degree-public-verification-proof/v2", "ckbuilder-credential/v2", "ckbuilder-passport/v1"]
        }, requestId);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/learning") {
        sendJson(response, 200, learningOverview(), requestId);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/ready") {
        const checks = { ledger: false, productDb: false };
        try { loadLedger(config.DATA_DIR); checks.ledger = true; } catch {}
        try { if (productDb) { productDb.prepare("SELECT 1 AS ok").get(); checks.productDb = true; } } catch {}
        const ok = checks.ledger && (!productDb || checks.productDb);
        sendJson(response, ok ? 200 : 503, { ok, checks, network: config.APP_NETWORK }, requestId); return;
      }

      if (request.method === "GET" && url.pathname === "/api/stats") {
        rateLimit(request, "stats");
        sendJson(response, 200, getPublicStats(config, productDb), requestId); return;
      }

      if (request.method === "GET" && url.pathname === "/api/directory") {
        rateLimit(request, "directory");
        if (config.PUBLIC_DIRECTORY_ENABLED !== true) throw new AppError("DIRECTORY_DISABLED", "The public credential directory is disabled by this deployment.");
        sendJson(response, 200, listPublicCredentials(config, productDb, {
          query: url.searchParams.get("q"), type: url.searchParams.get("type"), status: url.searchParams.get("status"),
          limit: url.searchParams.get("limit"), offset: url.searchParams.get("offset")
        }), requestId); return;
      }

      if (request.method === "GET" && url.pathname === "/api/config") {
        sendJson(response, 200, {
          appName: config.PUBLIC_APP_NAME ?? "CKBuilder Passport", network: config.APP_NETWORK,
          publicBaseUrl: config.PUBLIC_BASE_URL ?? null, aiEnabled: config.AI_ENABLED !== false,
          aiProviders: aiProviderCatalog(config.AI_DEFAULT_PROVIDER, config.AI_DEFAULT_MODEL),
          aiAgents: aiAgentCatalog(),
          aiPlugins: aiPluginCatalog(config.ROOT_DIR ?? path.resolve(publicDir, "..")),
          ckbApplications: ckbApplicationCatalog(config),
          agentServices: agentServiceCatalog(config, config.ROOT_DIR ?? path.resolve(publicDir, "..")).map((service) => ({ ...service, reputation: serviceReputation(config.DATA_DIR)[service.id] ?? { jobs: 0, fulfilled: 0, gaps: 0, blocked: 0, fulfillmentRate: null, evidenceSuccessRate: null, latestAt: null } })),
          aiDefaultProvider: config.AI_DEFAULT_PROVIDER ?? "openai", aiDefaultModel: config.AI_DEFAULT_MODEL ?? "gpt-4.1-mini",
          publicDirectoryEnabled: config.PUBLIC_DIRECTORY_ENABLED === true,
          supportedDocuments: supportedDocumentTypes(),
          htmlSupport: true, submissionAttachments: true
        }, requestId); return;
      }

      if (request.method === "GET" && /^\/api\/certificate\/[^/]+\/html$/.test(url.pathname)) {
        rateLimit(request, "certificate-html");
        const credentialId = decodeURIComponent(url.pathname.split("/")[3]);
        const record = loadLedger(config.DATA_DIR).credentials[credentialId];
        if (!record) { sendJson(response, 404, { error: "CREDENTIAL_NOT_FOUND" }, requestId); return; }
        const html = credentialHtml(record, config.PUBLIC_BASE_URL);
        writeHeaders(response, 200, {
          "content-type": "text/html; charset=utf-8", "content-length": Buffer.byteLength(html), "cache-control": "no-store",
          "content-disposition": `inline; filename="${credentialId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100)}.html"`,
          "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          "x-request-id": requestId
        });
        response.end(html); return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/certificate/")) {
        rateLimit(request, "certificate");
        const credentialId = decodeURIComponent(url.pathname.slice("/api/certificate/".length));
        const record = loadLedger(config.DATA_DIR).credentials[credentialId];
        if (!record) { sendJson(response, 404, { error: "CREDENTIAL_NOT_FOUND" }, requestId); return; }
        sendJson(response, 200, portableCredential(record, config.PUBLIC_BASE_URL), requestId); return;
      }

      if (request.method === "GET" && url.pathname === "/api/qr") {
        rateLimit(request, "qr");
        const credentialId = String(url.searchParams.get("credentialId") ?? "").trim();
        if (!credentialId || credentialId.length > 256) throw new AppError("CREDENTIAL_ID_INVALID", "credentialId is required.");
        const record = loadLedger(config.DATA_DIR).credentials[credentialId];
        if (!record) { sendJson(response, 404, { error: "CREDENTIAL_NOT_FOUND" }, requestId); return; }
        const base = String(config.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
        const svg = qrSvg(`${base}/?credentialId=${encodeURIComponent(credentialId)}#inspector`);
        writeHeaders(response, 200, { "content-type": "image/svg+xml; charset=utf-8", "content-length": Buffer.byteLength(svg), "cache-control": "public, max-age=3600", "x-request-id": requestId });
        response.end(svg); return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/passport/")) {
        rateLimit(request, "passport");
        if (!productDb) throw new AppError("PRODUCT_DB_UNAVAILABLE", "Passport storage is not enabled on this service.");
        const lockHash = decodeURIComponent(url.pathname.slice("/api/passport/".length));
        sendJson(response, 200, getPassport(config, productDb, lockHash), requestId); return;
      }

      if (request.method === "POST" && url.pathname === "/api/submissions") {
        rateLimit(request, "submission");
        if (!productDb) throw new AppError("PRODUCT_DB_UNAVAILABLE", "Evidence submissions are not enabled on this service.");
        const body = await readJsonBody(request, Math.min(maxBodyBytes, 256 * 1024));
        const created = createSubmission(productDb, validatePublicSubmission(body));
        sendJson(response, 201, created, requestId); return;
      }

      if (request.method === "POST" && /^\/api\/submissions\/[^/]+\/resubmit$/.test(url.pathname)) {
        rateLimit(request, "submission-resubmit");
        if (!productDb) throw new AppError("PRODUCT_DB_UNAVAILABLE", "Evidence submissions are not enabled on this service.");
        const id = decodeURIComponent(url.pathname.split("/")[3]);
        const body = await readJsonBody(request, Math.min(maxBodyBytes, 256 * 1024));
        const item = resubmitTrackedSubmission(productDb, id, body.trackingToken, validateResubmission(body));
        if (!item) { sendJson(response, 404, { error: "SUBMISSION_NOT_FOUND" }, requestId); return; }
        const { applicant_email, tracking_hash, ...safe } = item; sendJson(response, 200, safe, requestId); return;
      }

      if (request.method === "POST" && /^\/api\/submissions\/[^/]+\/cancel$/.test(url.pathname)) {
        rateLimit(request, "submission-cancel");
        if (!productDb) throw new AppError("PRODUCT_DB_UNAVAILABLE", "Evidence submissions are not enabled on this service.");
        const id = decodeURIComponent(url.pathname.split("/")[3]);
        const body = await readJsonBody(request, Math.min(maxBodyBytes, 32 * 1024));
        const item = cancelTrackedSubmission(productDb, id, body.trackingToken);
        if (!item) { sendJson(response, 404, { error: "SUBMISSION_NOT_FOUND" }, requestId); return; }
        const { applicant_email, tracking_hash, ...safe } = item; sendJson(response, 200, safe, requestId); return;
      }

      if (request.method === "POST" && /^\/api\/submissions\/[^/]+\/attachments$/.test(url.pathname)) {
        rateLimit(request, "submission-attachment");
        if (!productDb) throw new AppError("PRODUCT_DB_UNAVAILABLE", "Evidence submissions are not enabled on this service.");
        const id = decodeURIComponent(url.pathname.split("/")[3]);
        const body = await readJsonBody(request, Math.min(maxBodyBytes, 8 * 1024 * 1024));
        const submission = getTrackedSubmission(productDb, id, body.trackingToken);
        if (!submission) { sendJson(response, 404, { error: "SUBMISSION_NOT_FOUND" }, requestId); return; }
        if (!new Set(["SUBMITTED", "CHANGES_REQUESTED"]).has(submission.status)) throw new AppError("ATTACHMENT_STATE_INVALID", "Attachments can only be added while a submission is editable.");
        if (listAttachmentMetadata(productDb, id).length >= 10) throw new AppError("ATTACHMENT_LIMIT_REACHED", "A submission can contain at most 10 uploaded files.");
        const attachment = storeSubmissionAttachment(config, productDb, id, body, "applicant");
        sendJson(response, 201, attachment, requestId); return;
      }

      if (request.method === "GET" && /^\/api\/submissions\/[^/]+\/attachments$/.test(url.pathname)) {
        rateLimit(request, "submission-attachments");
        if (!productDb) throw new AppError("PRODUCT_DB_UNAVAILABLE", "Evidence submissions are not enabled on this service.");
        const id = decodeURIComponent(url.pathname.split("/")[3]);
        const submission = getTrackedSubmission(productDb, id, url.searchParams.get("token"));
        if (!submission) { sendJson(response, 404, { error: "SUBMISSION_NOT_FOUND" }, requestId); return; }
        sendJson(response, 200, { attachments: listAttachmentMetadata(productDb, id) }, requestId); return;
      }

      if (request.method === "DELETE" && /^\/api\/submissions\/[^/]+\/attachments\/[^/]+$/.test(url.pathname)) {
        rateLimit(request, "submission-attachment-delete");
        if (!productDb) throw new AppError("PRODUCT_DB_UNAVAILABLE", "Evidence submissions are not enabled on this service.");
        const parts = url.pathname.split("/"); const id = decodeURIComponent(parts[3]); const attachmentId = decodeURIComponent(parts[5]);
        const body = await readJsonBody(request, Math.min(maxBodyBytes, 32 * 1024));
        const submission = getTrackedSubmission(productDb, id, body.trackingToken);
        if (!submission) { sendJson(response, 404, { error: "SUBMISSION_NOT_FOUND" }, requestId); return; }
        if (!new Set(["SUBMITTED", "CHANGES_REQUESTED"]).has(submission.status)) throw new AppError("ATTACHMENT_STATE_INVALID", "Attachments can no longer be removed from this submission.");
        const removed = removeSubmissionAttachment(config, productDb, id, attachmentId, "applicant");
        if (!removed) { sendJson(response, 404, { error: "ATTACHMENT_NOT_FOUND" }, requestId); return; }
        sendJson(response, 200, { removed }, requestId); return;
      }

      if (request.method === "GET" && /^\/api\/submissions\/[^/]+$/.test(url.pathname)) {
        rateLimit(request, "submission-status");
        if (!productDb) throw new AppError("PRODUCT_DB_UNAVAILABLE", "Evidence submissions are not enabled on this service.");
        const id = decodeURIComponent(url.pathname.slice("/api/submissions/".length));
        const item = getTrackedSubmissionWithTimeline(productDb, id, url.searchParams.get("token"));
        if (!item) { sendJson(response, 404, { error: "SUBMISSION_NOT_FOUND" }, requestId); return; }
        const { applicant_email, tracking_hash, ...safe } = item;
        safe.attachments = listAttachmentMetadata(productDb, id);
        sendJson(response, 200, safe, requestId); return;
      }

      if (request.method === "POST" && url.pathname === "/api/document/inspect") {
        rateLimit(request, "document-inspect");
        const body = await readJsonBody(request, Math.min(maxBodyBytes, 8 * 1024 * 1024));
        sendJson(response, 200, inspectDocumentInput(body, { maxBytes: maxDocumentBytes, maxTextChars: 16000 }), requestId); return;
      }

      if (request.method === "POST" && url.pathname === "/api/ai/document") {
        rateLimit(request, "ai");
        if (config.AI_ENABLED === false) throw new AppError("AI_DISABLED", "AI features are disabled by this deployment.");
        const body = await readJsonBody(request, Math.min(maxBodyBytes, 8 * 1024 * 1024));
        sendJson(response, 200, await analyzeCredentialDocument(request.headers, body, config.AI_DEFAULT_MODEL, config.AI_DEFAULT_PROVIDER), requestId); return;
      }

      if (request.method === "POST" && url.pathname === "/api/ai/explain") {
        rateLimit(request, "ai");
        if (config.AI_ENABLED === false) throw new AppError("AI_DISABLED", "AI features are disabled by this deployment.");
        const body = await readJsonBody(request, Math.min(maxBodyBytes, 512 * 1024));
        sendJson(response, 200, await explainVerification(request.headers, body.proof, config.AI_DEFAULT_MODEL, config.AI_DEFAULT_PROVIDER), requestId); return;
      }

      if (request.method === "POST" && url.pathname === "/api/evidence/check") {
        rateLimit(request, "evidence-check");
        const body = await readJsonBody(request, Math.min(maxBodyBytes, 256 * 1024));
        const input = validatePublicSubmission(body);
        sendJson(response, 200, await verifyEvidenceReferences(config, input), requestId); return;
      }

      if (request.method === "POST" && url.pathname === "/api/ai/evidence") {
        rateLimit(request, "ai");
        if (config.AI_ENABLED === false) throw new AppError("AI_DISABLED", "AI features are disabled by this deployment.");
        const body = await readJsonBody(request, Math.min(maxBodyBytes, 256 * 1024));
        const input = validatePublicSubmission(body);
        const deterministicEvidence = await verifyEvidenceReferences(config, input);
        const ai = await analyzeEvidence(request.headers, { ...input, deterministicEvidence }, config.AI_DEFAULT_MODEL, config.AI_DEFAULT_PROVIDER);
        sendJson(response, 200, { ...ai, deterministicEvidence }, requestId); return;
      }

      if (request.method === "POST" && url.pathname === "/api/ai/tutor") {
        rateLimit(request, "ai");
        if (config.AI_ENABLED === false) throw new AppError("AI_DISABLED", "AI features are disabled by this deployment.");
        const body = await readJsonBody(request, Math.min(maxBodyBytes, 64 * 1024));
        const question = cleanText(body.question, "question", 3000);
        sendJson(response, 200, await tutor(request.headers, question, learningOverview(), config.AI_DEFAULT_MODEL, config.AI_DEFAULT_PROVIDER), requestId); return;
      }

      if (request.method === "POST" && url.pathname === "/api/agent-commerce/agreement") {
        rateLimit(request, "agent-commerce-agreement");
        const body = await readJsonBody(request, Math.min(maxBodyBytes, 64 * 1024));
        const service = getAgentService(body.serviceId ?? body.service, config, config.ROOT_DIR ?? path.resolve(publicDir, ".."));
        const objective = cleanText(body.objective ?? body.task, "objective", 6000);
        const agreement = createAgentServiceAgreement({ service, objective, input: body });
        sendJson(response, 200, { service: { id: service.id, title: service.title, outcome: service.outcome }, agreement }, requestId); return;
      }

      if (request.method === "POST" && url.pathname === "/api/agent-commerce/fiber-quote") {
        rateLimit(request, "agent-commerce-fiber-quote");
        if (config.AI_ENABLED === false) throw new AppError("AI_DISABLED", "Agent commerce features are disabled by this deployment.");
        const body = await readJsonBody(request, Math.min(maxBodyBytes, 64 * 1024));
        sendJson(response, 200, await createFiberPaymentQuote(body, config, {
          fetchImpl: options.aiFetchImpl ?? fetch, toolFetchImpl: options.toolFetchImpl ?? fetch, toolTimeoutMs: options.aiToolTimeoutMs
        }), requestId); return;
      }

      if (request.method === "POST" && url.pathname === "/api/agent-commerce/run") {
        rateLimit(request, "agent-commerce-run");
        if (config.AI_ENABLED === false) throw new AppError("AI_DISABLED", "Agent commerce features are disabled by this deployment.");
        const body = await readJsonBody(request, Math.min(maxBodyBytes, 128 * 1024));
        const result = await runAgentService(request.headers, body, config, {
          rootDir: config.ROOT_DIR ?? path.resolve(publicDir, ".."), fetchImpl: options.aiFetchImpl ?? fetch, toolFetchImpl: options.toolFetchImpl ?? fetch,
          timeoutMs: options.aiTimeoutMs, toolTimeoutMs: options.aiToolTimeoutMs
        });
        const access = result.receipt ? recordAgentJob(config.DATA_DIR, { objective: body.objective ?? body.task, result }) : null;
        sendJson(response, 200, access ? { ...result, jobAccess: access } : result, requestId); return;
      }

      if (request.method === "GET" && /^\/api\/agent-commerce\/jobs\/[^/]+$/.test(url.pathname)) {
        rateLimit(request, "agent-commerce-job");
        const jobId = decodeURIComponent(url.pathname.split("/")[4]);
        sendJson(response, 200, getAgentJob(config.DATA_DIR, jobId, url.searchParams.get("token")), requestId); return;
      }

      if (request.method === "POST" && url.pathname === "/api/agent-commerce/verify-receipt") {
        rateLimit(request, "agent-commerce-verify");
        const body = await readJsonBody(request, Math.min(maxBodyBytes, 256 * 1024));
        sendJson(response, 200, verifyAgentJobReceipt(body.receipt ?? body, { agreement: body.agreement ?? null, fulfillment: body.fulfillment ?? null }), requestId); return;
      }

      if (request.method === "POST" && url.pathname === "/api/agent-commerce/transaction-preflight") {
        rateLimit(request, "agent-commerce-preflight");
        const body = await readJsonBody(request, Math.min(maxBodyBytes, 512 * 1024));
        sendJson(response, 200, await runCkbTransactionPreflight(body, config, { rootDir: config.ROOT_DIR ?? path.resolve(publicDir, ".."), toolFetchImpl: options.toolFetchImpl ?? fetch, toolTimeoutMs: options.aiToolTimeoutMs }), requestId); return;
      }

      if (request.method === "GET" && url.pathname === "/api/agent-commerce/doctor") {
        rateLimit(request, "agent-commerce-doctor");
        sendJson(response, 200, agentRuntimeDoctor(config, config.ROOT_DIR ?? path.resolve(publicDir, "..")), requestId); return;
      }

      if (request.method === "POST" && url.pathname === "/api/ai/application") {
        rateLimit(request, "ai");
        if (config.AI_ENABLED === false) throw new AppError("AI_DISABLED", "AI features are disabled by this deployment.");
        const body = await readJsonBody(request, Math.min(maxBodyBytes, 128 * 1024));
        sendJson(response, 200, await runCkbApplication(request.headers, body, config, {
          rootDir: config.ROOT_DIR ?? path.resolve(publicDir, ".."),
          rpcUrl: config.CKB_RPC_URL,
          fiberRpcUrl: config.FIBER_RPC_URL,
          workspaceDir: config.CKB_AGENT_WORKSPACE,
          githubToken: config.CKB_GITHUB_TOKEN,
          fetchImpl: aiFetchImpl,
          toolFetchImpl
        }), requestId); return;
      }

      if (request.method === "POST" && url.pathname === "/api/ai/agent") {
        rateLimit(request, "ai");
        if (config.AI_ENABLED === false) throw new AppError("AI_DISABLED", "AI features are disabled by this deployment.");
        const body = await readJsonBody(request, Math.min(maxBodyBytes, 128 * 1024));
        sendJson(response, 200, await runCkbAgent(request.headers, body, config.AI_DEFAULT_MODEL, config.AI_DEFAULT_PROVIDER, {
          rootDir: config.ROOT_DIR ?? path.resolve(publicDir, ".."),
          rpcUrl: config.CKB_RPC_URL,
          fiberRpcUrl: config.FIBER_RPC_URL,
          workspaceDir: config.CKB_AGENT_WORKSPACE,
          githubToken: config.CKB_GITHUB_TOKEN,
          fetchImpl: aiFetchImpl,
          toolFetchImpl
        }), requestId); return;
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
          : error?.code === "RATE_LIMITED" ? 429
            : error?.code === "RESUBMISSION_NOT_ALLOWED" || error?.code === "CANCELLATION_NOT_ALLOWED" ? 409
              : error?.code === "DIRECTORY_DISABLED" ? 404
                : 400;
      sendJson(response, status, {
        error: known ? error.code : "INSPECTION_FAILED",
        message: known ? error.message : "Inspection failed. Check the request, public credential data, and RPC configuration."
      }, requestId);
    }
  });
}
