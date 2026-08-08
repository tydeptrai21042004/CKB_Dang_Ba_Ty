import { AppError } from "./errors.js";

export const CREDENTIAL_SCHEMA = "ckbuilder-credential/v2";
export const LEGACY_CREDENTIAL_SCHEMA = "ckb-degree-credential/v1";
export const RECORD_SCHEMA = "ckb-degree-proof-record/v1";
export const LEDGER_SCHEMA = "ckb-degree-proof-ledger/v1";
export const STATUS_ACTIVE = "ACTIVE";
export const STATUS_REVOKED = "REVOKED";

const HEX_32 = /^0x[0-9a-fA-F]{64}$/;

export function validateMintInput(input) {
  const requiredStrings = [
    "credentialId",
    "recipientLockHash",
    "studentId",
    "identitySalt",
    "degreeTitle",
    "fieldOfStudy",
    "issuedAt"
  ];
  const missing = requiredStrings.filter((key) => typeof input?.[key] !== "string" || input[key].trim() === "");
  if (missing.length) throw new AppError("MINT_INPUT_INVALID", "Credential input is missing required fields.", { missing });
  if (!HEX_32.test(input.recipientLockHash)) {
    throw new AppError("RECIPIENT_LOCK_HASH_INVALID", "recipientLockHash must be a 32-byte hexadecimal hash.");
  }
  if (!isValidCalendarDate(input.issuedAt)) {
    throw new AppError("ISSUE_DATE_INVALID", "issuedAt must be a real calendar date in YYYY-MM-DD format.");
  }
  if (input.credentialId.length > 128) {
    throw new AppError("CREDENTIAL_ID_TOO_LONG", "credentialId must be 128 characters or fewer.");
  }
}

export function validateCredentialPayload(payload) {
  if (![CREDENTIAL_SCHEMA, LEGACY_CREDENTIAL_SCHEMA].includes(payload?.schema)) throw new AppError("SCHEMA_INVALID", `Expected schema ${CREDENTIAL_SCHEMA} or legacy ${LEGACY_CREDENTIAL_SCHEMA}.`);
  if (payload.schema === CREDENTIAL_SCHEMA && (typeof payload.credentialType !== "string" || payload.credentialType.trim() === "")) throw new AppError("CREDENTIAL_TYPE_INVALID", "credentialType is required for v2 credentials.");
  if (typeof payload.credentialId !== "string" || payload.credentialId.length === 0) throw new AppError("CREDENTIAL_ID_INVALID", "credentialId is missing.");
  if (!HEX_32.test(payload.issuer?.issuerId ?? "")) throw new AppError("ISSUER_ID_INVALID", "issuerId is invalid.");
  if (!HEX_32.test(payload.issuer?.lockHash ?? "")) throw new AppError("ISSUER_LOCK_HASH_INVALID", "issuer lock hash is invalid.");
  if (!HEX_32.test(payload.subject?.recipientLockHash ?? "")) throw new AppError("RECIPIENT_LOCK_HASH_INVALID", "recipient lock hash is invalid.");
  if (!HEX_32.test(payload.subject?.identityCommitment ?? "")) throw new AppError("IDENTITY_COMMITMENT_INVALID", "identity commitment is invalid.");
  if (payload.document?.hashAlgorithm !== "sha256") throw new AppError("DOCUMENT_HASH_ALGORITHM_INVALID", "Only sha256 is supported by this reference implementation.");
  if (!HEX_32.test(payload.document?.hash ?? "")) throw new AppError("DOCUMENT_HASH_INVALID", "document hash is invalid.");
}

function isValidCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
