import { loadLedger } from "./ledger.js";
import { getProfile } from "./product-db.js";

const LOCK_HASH = /^0x[0-9a-fA-F]{64}$/;
export function publicCredentialSummary(record) {
  if (!record?.payload) return null;
  return {
    credentialId: record.payload.credentialId,
    credentialType: record.payload.credentialType ?? "AcademicCredential",
    status: record.status,
    issuer: { issuerId: record.payload.issuer.issuerId, name: record.payload.issuer.name, lockHash: record.payload.issuer.lockHash },
    subject: { recipientLockHash: record.payload.subject.recipientLockHash },
    award: record.payload.award,
    document: { hashAlgorithm: record.payload.document.hashAlgorithm, hash: record.payload.document.hash },
    createdAt: record.payload.createdAt,
    revokedAt: record.revocation?.event?.revokedAt ?? null,
    revocationReason: record.revocation?.event?.reason ?? null
  };
}
export function getPassport(config, db, recipientLockHash) {
  if (!LOCK_HASH.test(recipientLockHash)) throw new Error("recipientLockHash must be a 32-byte 0x-prefixed hash.");
  const lock = recipientLockHash.toLowerCase();
  const ledger = loadLedger(config.DATA_DIR);
  const credentials = Object.values(ledger.credentials).filter((record) => record?.payload?.subject?.recipientLockHash?.toLowerCase() === lock).map(publicCredentialSummary).filter(Boolean).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const profile = db ? getProfile(db, lock) : null;
  return {
    schema: "ckbuilder-passport/v1",
    recipientLockHash: lock,
    displayName: profile?.display_name ?? null,
    bio: profile?.bio ?? null,
    counts: { total: credentials.length, active: credentials.filter((x) => x.status === "ACTIVE").length, revoked: credentials.filter((x) => x.status === "REVOKED").length },
    credentials
  };
}
