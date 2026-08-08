import { loadLedger } from "./ledger.js";
import { publicCredentialSummary } from "./passport-service.js";
import { getProfile } from "./product-db.js";

function boundedInt(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.trunc(number), min), max);
}
function text(value) { return String(value ?? "").trim().toLowerCase(); }

export function listPublicCredentials(config, db, options = {}) {
  const limit = boundedInt(options.limit, 25, 1, 100);
  const offset = boundedInt(options.offset, 0, 0, 100000);
  const query = text(options.query).slice(0, 160);
  const type = text(options.type).slice(0, 100);
  const status = text(options.status).slice(0, 40);
  const ledger = loadLedger(config.DATA_DIR);
  let items = Object.values(ledger.credentials).map(publicCredentialSummary).filter(Boolean);
  if (type) items = items.filter((item) => text(item.credentialType) === type);
  if (status) items = items.filter((item) => text(item.status) === status);
  if (query) {
    items = items.filter((item) => {
      const profile = db ? getProfile(db, item.subject.recipientLockHash) : null;
      return [item.credentialId, item.credentialType, item.award?.title, item.award?.fieldOfStudy,
        item.award?.classification, item.issuer?.name, profile?.display_name, item.subject.recipientLockHash]
        .some((value) => text(value).includes(query));
    });
  }
  items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const total = items.length;
  return {
    schema: "ckbuilder-public-directory/v1",
    total,
    limit,
    offset,
    items: items.slice(offset, offset + limit).map((item) => {
      const profile = db ? getProfile(db, item.subject.recipientLockHash) : null;
      return { ...item, displayName: profile?.display_name ?? null };
    })
  };
}

export function getPublicStats(config, db) {
  const ledger = loadLedger(config.DATA_DIR);
  const items = Object.values(ledger.credentials).map(publicCredentialSummary).filter(Boolean);
  const byType = {};
  const byStatus = {};
  for (const item of items) {
    byType[item.credentialType] = (byType[item.credentialType] ?? 0) + 1;
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
  }
  const uniqueBuilders = new Set(items.map((item) => item.subject.recipientLockHash.toLowerCase())).size;
  return {
    schema: "ckbuilder-public-stats/v1",
    credentials: items.length,
    active: byStatus.ACTIVE ?? 0,
    revoked: byStatus.REVOKED ?? 0,
    uniqueBuilders,
    byType,
    byStatus
  };
}
