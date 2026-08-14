import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AppError } from "./errors.js";

const SCHEMA = "ckbuilder-agent-service-identity/v1";

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function identityPath(dataDir) { return path.join(path.resolve(dataDir), "private", "agent-service-identity.json"); }

function validateIdentity(value) {
  if (!value || value.schema !== SCHEMA || !value.serviceId || !value.privateKeyPem || !value.publicKeyDer) {
    throw new AppError("AGENT_IDENTITY_INVALID", "Stored CKBuilder agent service identity is invalid.");
  }
  const publicDer = Buffer.from(value.publicKeyDer, "base64url");
  const expected = `svc_${sha256(publicDer).slice(0, 24)}`;
  if (value.serviceId !== expected) throw new AppError("AGENT_IDENTITY_INVALID", "Stored CKBuilder agent service identity fingerprint does not match its public key.");
  return value;
}

export function loadOrCreateAgentServiceIdentity(dataDir) {
  if (!dataDir) throw new AppError("AGENT_IDENTITY_DATA_DIR_REQUIRED", "DATA_DIR is required for persistent agent service identity.");
  const file = identityPath(dataDir);
  if (fs.existsSync(file)) return validateIdentity(JSON.parse(fs.readFileSync(file, "utf8")));
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicDer = publicKey.export({ type: "spki", format: "der" });
  const value = {
    schema: SCHEMA,
    serviceId: `svc_${sha256(publicDer).slice(0, 24)}`,
    algorithm: "Ed25519",
    createdAt: new Date().toISOString(),
    publicKeyDer: Buffer.from(publicDer).toString("base64url"),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString()
  };
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
  try { fs.chmodSync(file, 0o600); } catch {}
  return value;
}

export function publicAgentServiceIdentity(identity) {
  const value = validateIdentity(identity);
  return { schema: SCHEMA, serviceId: value.serviceId, algorithm: value.algorithm, createdAt: value.createdAt, publicKeyDer: value.publicKeyDer };
}

export function signAgentReceiptHash(identity, receiptHash) {
  const value = validateIdentity(identity);
  const match = /^sha256:([0-9a-f]{64})$/i.exec(String(receiptHash ?? ""));
  if (!match) throw new AppError("AGENT_RECEIPT_HASH_INVALID", "Receipt hash must be sha256:<64 hex> before signing.");
  return crypto.sign(null, Buffer.from(match[1], "hex"), value.privateKeyPem).toString("base64url");
}

export function verifyAgentReceiptSignature({ receiptHash, issuerPublicKey, signature }) {
  try {
    const match = /^sha256:([0-9a-f]{64})$/i.exec(String(receiptHash ?? ""));
    if (!match || !issuerPublicKey || !signature) return false;
    const key = crypto.createPublicKey({ key: Buffer.from(String(issuerPublicKey), "base64url"), type: "spki", format: "der" });
    return crypto.verify(null, Buffer.from(match[1], "hex"), key, Buffer.from(String(signature), "base64url"));
  } catch { return false; }
}
