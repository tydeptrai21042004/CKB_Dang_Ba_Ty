import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AppError } from "./errors.js";
import {
  generateIssuerKeys,
  hashFile,
  identityCommitment,
  issuerIdFromPublicKey,
  loadPrivateKey,
  loadPublicKey,
  publicKeyPem,
  signObject,
  verifyObject
} from "./crypto.js";
import { loadLedger, saveLedger } from "./ledger.js";
import { ensureParent, readJson, writeJsonAtomic } from "./json.js";
import {
  CREDENTIAL_SCHEMA,
  RECORD_SCHEMA,
  STATUS_ACTIVE,
  STATUS_REVOKED,
  validateCredentialPayload,
  validateMintInput
} from "./schema.js";
import {
  CHAIN_STATUS_ACTIVE,
  CHAIN_STATUS_REVOKED,
  credentialHash,
  encodeRevocationRecord
} from "./revocation-binary.js";

const REVOCATION_SCHEMA = "ckb-degree-revocation/v1";

export function initializeIssuer(env) {
  const result = generateIssuerKeys(env.ISSUER_PRIVATE_KEY_PATH, env.ISSUER_PUBLIC_KEY_PATH);
  const publicKey = loadPublicKey(env.ISSUER_PUBLIC_KEY_PATH);
  const issuerId = issuerIdFromPublicKey(publicKey);
  const trusted = readJson(env.TRUSTED_ISSUERS_FILE, { schema: "ckb-degree-proof-trusted-issuers/v1", issuers: {} });
  trusted.issuers[issuerId] = {
    name: env.ISSUER_NAME,
    publicKeyPem: publicKeyPem(publicKey),
    lockHash: env.ISSUER_LOCK_HASH
  };
  writeJsonAtomic(env.TRUSTED_ISSUERS_FILE, trusted);
  return { ...result, issuerId };
}

export function prepareCredential(env, input, documentPath, options = {}) {
  validateMintInput(input);
  const privateKey = loadPrivateKey(env.ISSUER_PRIVATE_KEY_PATH);
  const publicKey = loadPublicKey(env.ISSUER_PUBLIC_KEY_PATH);
  const issuerId = issuerIdFromPublicKey(publicKey);
  const ledger = loadLedger(env.DATA_DIR);
  if (ledger.credentials[input.credentialId]) {
    throw new AppError("CREDENTIAL_ALREADY_EXISTS", `Credential already exists: ${input.credentialId}`);
  }

  const payload = {
    schema: CREDENTIAL_SCHEMA,
    credentialId: input.credentialId,
    credentialType: input.credentialType ?? "AcademicCredential",
    issuer: {
      issuerId,
      name: env.ISSUER_NAME,
      lockHash: env.ISSUER_LOCK_HASH
    },
    subject: {
      recipientLockHash: input.recipientLockHash.toLowerCase(),
      identityCommitment: identityCommitment(input.studentId, input.identitySalt)
    },
    award: {
      title: input.degreeTitle,
      field: input.fieldOfStudy,
      classification: input.classification ?? null,
      issuedAt: input.issuedAt
    },
    document: {
      hashAlgorithm: "sha256",
      hash: hashFile(documentPath),
      fileName: path.basename(documentPath)
    },
    createdAt: options.createdAt ?? new Date().toISOString()
  };
  validateCredentialPayload(payload);
  const signature = signObject(payload, privateKey);
  const record = {
    schema: RECORD_SCHEMA,
    status: STATUS_ACTIVE,
    payload,
    issuerPublicKeyPem: publicKeyPem(publicKey),
    signature,
    revocation: null
  };
  const activeBinary = encodeRevocationRecord({
    status: CHAIN_STATUS_ACTIVE,
    credentialId: input.credentialId,
    issuerLockHash: env.ISSUER_LOCK_HASH,
    reasonCode: 0,
    revokedAt: 0n
  });
  return { record, activeBinary };
}

export function persistPreparedCredential(env, prepared) {
  const { record, activeBinary } = prepared;
  validateCredentialPayload(record?.payload);
  const credentialId = record.payload.credentialId;
  const ledger = loadLedger(env.DATA_DIR);
  if (ledger.credentials[credentialId]) {
    throw new AppError("CREDENTIAL_ALREADY_EXISTS", `Credential already exists: ${credentialId}`);
  }
  const updated = structuredClone(ledger);
  updated.credentials[credentialId] = record;

  const artifactStem = credentialArtifactStem(credentialId);
  const credentialDir = path.join(env.DATA_DIR, "credentials");
  const chainDir = path.join(env.DATA_DIR, "revocations");
  fs.mkdirSync(credentialDir, { recursive: true });
  fs.mkdirSync(chainDir, { recursive: true });
  saveLedger(env.DATA_DIR, updated);
  writeJsonAtomic(path.join(credentialDir, `${artifactStem}.json`), record);
  fs.writeFileSync(path.join(chainDir, `${artifactStem}-active.bin`), activeBinary);
  return record;
}

export function mintCredential(env, input, documentPath, options = {}) {
  const prepared = prepareCredential(env, input, documentPath, options);
  return persistPreparedCredential(env, prepared);
}

export function prepareRevocation(env, credentialId, reasonCode, reasonText, options = {}) {
  const ledger = loadLedger(env.DATA_DIR);
  const record = ledger.credentials[credentialId];
  if (!record) throw new AppError("CREDENTIAL_NOT_FOUND", `Credential not found: ${credentialId}`);
  if (record.status === STATUS_REVOKED || ledger.revocations[credentialId] || record.revocation) {
    throw new AppError("CREDENTIAL_ALREADY_REVOKED", `Credential is already revoked: ${credentialId}`);
  }
  if (!Number.isInteger(reasonCode) || reasonCode < 1 || reasonCode > 255) {
    throw new AppError("REASON_CODE_INVALID", "Revocation reasonCode must be between 1 and 255.");
  }
  if (typeof reasonText !== "string" || reasonText.trim() === "") {
    throw new AppError("REVOCATION_REASON_MISSING", "A human-readable revocation reason is required.");
  }
  const privateKey = loadPrivateKey(env.ISSUER_PRIVATE_KEY_PATH);
  const publicKey = loadPublicKey(env.ISSUER_PUBLIC_KEY_PATH);
  const issuerId = issuerIdFromPublicKey(publicKey);
  if (issuerId !== record.payload.issuer.issuerId) throw new AppError("ISSUER_MISMATCH", "The configured issuer is not authorized to revoke this credential.");

  const revokedAtIso = options.revokedAt ?? new Date().toISOString();
  const revokedAtMs = Date.parse(revokedAtIso);
  if (!Number.isFinite(revokedAtMs)) throw new AppError("REVOCATION_DATE_INVALID", "revokedAt must be a valid ISO-8601 timestamp.");
  const normalizedRevokedAt = new Date(revokedAtMs).toISOString();
  const event = { schema: REVOCATION_SCHEMA, credentialId, issuerId, reasonCode, reason: reasonText.trim(), revokedAt: normalizedRevokedAt };
  const revocation = { event, signature: signObject(event, privateKey) };
  const binary = encodeRevocationRecord({ status: CHAIN_STATUS_REVOKED, credentialId, issuerLockHash: env.ISSUER_LOCK_HASH, reasonCode, revokedAt: BigInt(Math.floor(revokedAtMs / 1000)) });
  return { revocation, binary };
}

export function persistPreparedRevocation(env, credentialId, prepared) {
  const ledger = loadLedger(env.DATA_DIR);
  const record = ledger.credentials[credentialId];
  if (!record) throw new AppError("CREDENTIAL_NOT_FOUND", `Credential not found: ${credentialId}`);
  if (record.status === STATUS_REVOKED || ledger.revocations[credentialId] || record.revocation) throw new AppError("CREDENTIAL_ALREADY_REVOKED", `Credential is already revoked: ${credentialId}`);
  const updated = structuredClone(ledger);
  updated.credentials[credentialId].status = STATUS_REVOKED;
  updated.credentials[credentialId].revocation = prepared.revocation;
  updated.revocations[credentialId] = prepared.revocation;
  const chainDir = path.join(env.DATA_DIR, "revocations");
  const finalBinaryPath = path.join(chainDir, `${credentialArtifactStem(credentialId)}-revoked.bin`);
  const temporaryBinaryPath = `${finalBinaryPath}.${process.pid}.tmp`;
  ensureParent(finalBinaryPath);
  fs.writeFileSync(temporaryBinaryPath, prepared.binary, { mode: 0o600 });
  try {
    saveLedger(env.DATA_DIR, updated);
    fs.renameSync(temporaryBinaryPath, finalBinaryPath);
  } catch (error) {
    try { saveLedger(env.DATA_DIR, ledger); } catch {}
    fs.rmSync(temporaryBinaryPath, { force: true });
    throw error;
  }
  return prepared.revocation;
}

export function revokeCredential(env, credentialId, reasonCode, reasonText, options = {}) {
  return persistPreparedRevocation(env, credentialId, prepareRevocation(env, credentialId, reasonCode, reasonText, options));
}

export function verifyCredential(env, credentialId, documentPath, options = {}) {
  if (!documentPath) {
    throw new AppError("DOCUMENT_REQUIRED", "A certificate document is required for full credential verification.");
  }
  return verifyCredentialInternal(env, credentialId, documentPath, { ...options, allowMissingDocument: false });
}

/**
 * Read-only verification used by the Public Credential Inspector.
 * This function never loads an issuer private key. A document is optional;
 * without it, the result is an inspection rather than complete verification.
 */
export function verifyCredentialPublic(env, credentialId, documentPath = undefined, options = {}) {
  return verifyCredentialInternal(env, credentialId, documentPath, { ...options, allowMissingDocument: true });
}

function verifyCredentialInternal(env, credentialId, documentPath, options) {
  const checks = [];
  const fail = (name, code, message) => checks.push({ name, ok: false, code, message });
  const pass = (name, message) => checks.push({ name, ok: true, message });
  const skip = (name, code, message) => checks.push({ name, ok: null, code, message });

  const ledger = loadLedger(env.DATA_DIR);
  const record = ledger.credentials[credentialId];
  if (!record) {
    fail("credential_exists", "CREDENTIAL_NOT_FOUND", `Credential not found: ${credentialId}`);
    return result(false, checks, null, { documentVerified: false, integrityValid: false });
  }
  pass("credential_exists", "Credential record exists.");

  try {
    validateCredentialPayload(record.payload);
    if (record.payload.credentialId !== credentialId) {
      fail("credential_binding", "CREDENTIAL_ID_MISMATCH", "Stored credential payload is bound to a different credentialId.");
    } else {
      pass("credential_binding", "Stored credential payload is bound to the requested credentialId.");
    }
    pass("schema", "Credential schema and field encodings are valid.");
  } catch (error) {
    fail("schema", error.code ?? "SCHEMA_INVALID", error.message);
  }

  const trusted = readJson(env.TRUSTED_ISSUERS_FILE, { issuers: {} });
  const trustedIssuer = trusted.issuers?.[record.payload?.issuer?.issuerId];
  if (!trustedIssuer) {
    fail("trusted_issuer", "UNTRUSTED_ISSUER", "Issuer is not present in the trusted issuer registry.");
  } else if (trustedIssuer.lockHash.toLowerCase() !== record.payload.issuer.lockHash.toLowerCase()) {
    fail("trusted_issuer", "ISSUER_LOCK_HASH_MISMATCH", "Issuer lock hash differs from the trusted registry.");
  } else {
    pass("trusted_issuer", "Issuer ID and lock hash are trusted.");
  }

  let recordPublicKey;
  try {
    recordPublicKey = crypto.createPublicKey(record.issuerPublicKeyPem);
    const keyId = issuerIdFromPublicKey(recordPublicKey);
    if (keyId !== record.payload.issuer.issuerId) {
      fail("issuer_key", "ISSUER_KEY_ID_MISMATCH", "Embedded issuer public key does not match issuerId.");
    } else {
      pass("issuer_key", "Issuer public key matches issuerId.");
    }
    if (!verifyObject(record.payload, record.signature, recordPublicKey)) {
      fail("credential_signature", "SIGNATURE_INVALID", "Credential signature is invalid or the payload was modified.");
    } else {
      pass("credential_signature", "Credential signature is valid.");
    }
  } catch {
    fail("credential_signature", "SIGNATURE_INVALID", "Credential signature or public key could not be verified.");
  }

  let documentVerified = false;
  if (documentPath) {
    try {
      const actualHash = hashFile(documentPath);
      if (actualHash !== record.payload.document.hash) {
        fail("document_hash", "DOCUMENT_HASH_MISMATCH", "Uploaded document differs from the document used during minting.");
      } else {
        documentVerified = true;
        pass("document_hash", "Uploaded document hash matches the credential.");
      }
    } catch (error) {
      fail("document_hash", error.code ?? "DOCUMENT_READ_FAILED", error.message);
    }
  } else if (options.allowMissingDocument) {
    skip("document_hash", "DOCUMENT_NOT_PROVIDED", "No document was supplied; document integrity was not checked.");
  }

  if (options.recipientLockHash) {
    if (options.recipientLockHash.toLowerCase() !== record.payload.subject.recipientLockHash.toLowerCase()) {
      fail("recipient_binding", "RECIPIENT_MISMATCH", "The supplied recipient lock hash does not match the credential.");
    } else {
      pass("recipient_binding", "Recipient lock hash matches.");
    }
  }

  if (options.studentId || options.identitySalt) {
    try {
      const commitment = identityCommitment(options.studentId, options.identitySalt);
      if (commitment !== record.payload.subject.identityCommitment) {
        fail("identity_commitment", "IDENTITY_COMMITMENT_MISMATCH", "Student identity commitment does not match.");
      } else {
        pass("identity_commitment", "Private student identity commitment matches.");
      }
    } catch (error) {
      fail("identity_commitment", error.code ?? "IDENTITY_INPUT_INVALID", error.message);
    }
  }

  const revocationRecord = ledger.revocations[credentialId] ?? record.revocation;
  let validSignedRevocation = false;
  if (record.status === STATUS_REVOKED || revocationRecord) {
    if (!revocationRecord?.event || typeof revocationRecord.signature !== "string") {
      fail("revocation_signature", "REVOCATION_SIGNATURE_INVALID", "Revocation record is malformed or unsigned.");
    } else {
      const event = revocationRecord.event;
      if (event.schema !== REVOCATION_SCHEMA) {
        fail("revocation_schema", "REVOCATION_SCHEMA_INVALID", "Revocation event schema is not supported.");
      } else {
        pass("revocation_schema", "Revocation event schema is supported.");
      }
      if (event.credentialId !== credentialId || event.credentialId !== record.payload.credentialId) {
        fail("revocation_credential_binding", "REVOCATION_CREDENTIAL_MISMATCH", "Revocation event is signed for a different credential.");
      } else {
        pass("revocation_credential_binding", "Revocation event is bound to this credential.");
      }
      if (event.issuerId !== record.payload.issuer.issuerId) {
        fail("revocation_issuer_binding", "REVOCATION_ISSUER_MISMATCH", "Revocation event is signed for a different issuer identity.");
      } else {
        pass("revocation_issuer_binding", "Revocation event is bound to the credential issuer.");
      }
      if (!Number.isInteger(event.reasonCode) || event.reasonCode < 1 || event.reasonCode > 255) {
        fail("revocation_reason", "REVOCATION_REASON_CODE_INVALID", "Revocation reasonCode must be between 1 and 255.");
      } else if (typeof event.reason !== "string" || event.reason.trim() === "") {
        fail("revocation_reason", "REVOCATION_REASON_INVALID", "Revocation reason is missing.");
      } else {
        pass("revocation_reason", "Revocation reason is valid.");
      }
      if (!Number.isFinite(Date.parse(event.revokedAt))) {
        fail("revocation_timestamp", "REVOCATION_DATE_INVALID", "Revocation timestamp is invalid.");
      } else {
        pass("revocation_timestamp", "Revocation timestamp is valid.");
      }

      if (!recordPublicKey || !verifyObject(event, revocationRecord.signature, recordPublicKey)) {
        fail("revocation_signature", "REVOCATION_SIGNATURE_INVALID", "Revocation event signature is invalid.");
      } else {
        validSignedRevocation = true;
        pass("revocation_signature", "Revocation event signature is valid.");
      }
    }

    if (record.status === STATUS_ACTIVE && validSignedRevocation) {
      fail("revocation_status", "REACTIVATION_DETECTED", "A signed revocation exists but the off-chain record was changed back to ACTIVE.");
    } else if (record.status === STATUS_REVOKED && validSignedRevocation) {
      fail("revocation_status", "CREDENTIAL_REVOKED", `Credential was revoked: ${revocationRecord.event.reason}`);
    } else if (![STATUS_ACTIVE, STATUS_REVOKED].includes(record.status)) {
      fail("revocation_status", "STATUS_INVALID", `Unknown credential status: ${record.status}`);
    }
  } else if (record.status === STATUS_ACTIVE) {
    pass("revocation_status", "Credential is active.");
  } else {
    fail("revocation_status", "STATUS_INVALID", `Unknown credential status: ${record.status}`);
  }

  const nonBlockingStatusCodes = new Set(["CREDENTIAL_REVOKED"]);
  const integrityValid = checks.every((check) => check.ok !== false || nonBlockingStatusCodes.has(check.code));
  const complete = checks.every((check) => check.ok !== null);
  const active = record.status === STATUS_ACTIVE && !validSignedRevocation;
  const valid = integrityValid && complete && documentVerified && active;

  return result(valid, checks, record, { documentVerified, integrityValid, complete, active });
}

function result(valid, checks, record, details = {}) {
  return {
    valid,
    integrityValid: details.integrityValid ?? valid,
    complete: details.complete ?? true,
    active: details.active ?? record?.status === STATUS_ACTIVE,
    documentVerified: details.documentVerified ?? false,
    checks,
    credential: record?.payload ?? null,
    status: record?.status ?? null
  };
}

function credentialArtifactStem(value) {
  const readable = value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80) || "credential";
  return `${readable}-${credentialHash(value).slice(2, 14)}`;
}
