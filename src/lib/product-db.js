import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

function now() { return new Date().toISOString(); }
function json(value) { return JSON.stringify(value ?? null); }
function parsed(value, fallback = null) {
  try { return value == null ? fallback : JSON.parse(value); } catch { return fallback; }
}
function normalizeRow(row) {
  if (!row) return null;
  const out = { ...row };
  for (const key of ["evidence_json", "ai_json", "detail_json", "chain_json", "payload_json", "headers_json"]) {
    if (key in out) out[key.replace(/_json$/, "")] = parsed(out[key], key === "evidence_json" ? [] : null);
    delete out[key];
  }
  return out;
}
function boundedInt(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.trunc(number), min), max);
}

export function openProductDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS profiles (
      recipient_lock_hash TEXT PRIMARY KEY, display_name TEXT, bio TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY, tracking_hash TEXT NOT NULL, applicant_name TEXT NOT NULL,
      applicant_email TEXT NOT NULL, recipient_lock_hash TEXT NOT NULL,
      credential_type TEXT NOT NULL, credential_title TEXT NOT NULL, category TEXT NOT NULL,
      evidence_json TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL,
      ai_json TEXT, reviewer_notes TEXT, issued_credential_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS submissions_status_idx ON submissions(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS submissions_lock_idx ON submissions(recipient_lock_hash, created_at DESC);
    CREATE TABLE IF NOT EXISTS submission_events (
      id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      actor TEXT NOT NULL, event_type TEXT NOT NULL, detail_json TEXT, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS submission_events_idx ON submission_events(submission_id, created_at ASC);
    CREATE TABLE IF NOT EXISTS submission_attachments (
      id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL, mime_type TEXT NOT NULL, sha256 TEXT NOT NULL, byte_length INTEGER NOT NULL,
      storage_relpath TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS submission_attachments_submission_idx ON submission_attachments(submission_id, created_at ASC);
    CREATE TABLE IF NOT EXISTS operations (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, credential_id TEXT NOT NULL, status TEXT NOT NULL,
      chain_json TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS operations_credential_idx ON operations(credential_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS operations_status_idx ON operations(status, created_at DESC);
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, target_type TEXT NOT NULL,
      target_id TEXT NOT NULL, detail_json TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id TEXT PRIMARY KEY, event_type TEXT NOT NULL, target_url TEXT NOT NULL,
      status TEXT NOT NULL, http_status INTEGER, error TEXT, payload_json TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS webhook_status_idx ON webhook_deliveries(status, created_at DESC);
  `);
  return db;
}

export function closeProductDb(db) { try { db?.close(); } catch {} }

export function addSubmissionEvent(db, submissionId, eventType, detail = null, actor = "system") {
  const event = { id: crypto.randomUUID(), submissionId, actor, eventType, detail, createdAt: now() };
  db.prepare("INSERT INTO submission_events(id,submission_id,actor,event_type,detail_json,created_at) VALUES(?,?,?,?,?,?)")
    .run(event.id, submissionId, actor, eventType, json(detail), event.createdAt);
  return event;
}
export function listSubmissionEvents(db, submissionId) {
  return db.prepare("SELECT * FROM submission_events WHERE submission_id=? ORDER BY created_at ASC, rowid ASC").all(submissionId).map(normalizeRow);
}

export function createSubmission(db, input) {
  const id = crypto.randomUUID();
  const trackingToken = crypto.randomBytes(24).toString("base64url");
  const trackingHash = crypto.createHash("sha256").update(trackingToken).digest("hex");
  const ts = now();
  db.prepare(`INSERT INTO submissions
    (id, tracking_hash, applicant_name, applicant_email, recipient_lock_hash, credential_type,
     credential_title, category, evidence_json, notes, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?, ?)`) 
    .run(id, trackingHash, input.applicantName, input.applicantEmail, input.recipientLockHash.toLowerCase(),
      input.credentialType, input.credentialTitle, input.category, json(input.evidence ?? []), input.notes ?? "", ts, ts);
  addSubmissionEvent(db, id, "SUBMITTED", { credentialType: input.credentialType, credentialTitle: input.credentialTitle }, "applicant");
  return { id, trackingToken, status: "SUBMITTED", createdAt: ts };
}

function verifyTrackingToken(row, trackingToken) {
  if (!row || !trackingToken) return false;
  const hash = crypto.createHash("sha256").update(String(trackingToken)).digest("hex");
  const a = Buffer.from(hash); const b = Buffer.from(row.tracking_hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export function getTrackedSubmission(db, id, trackingToken) {
  const row = db.prepare("SELECT * FROM submissions WHERE id=?").get(id);
  return verifyTrackingToken(row, trackingToken) ? normalizeRow(row) : null;
}
export function getTrackedSubmissionWithTimeline(db, id, trackingToken) {
  const item = getTrackedSubmission(db, id, trackingToken);
  if (!item) return null;
  return { ...item, timeline: listSubmissionEvents(db, id) };
}

export function resubmitTrackedSubmission(db, id, trackingToken, patch) {
  const row = db.prepare("SELECT * FROM submissions WHERE id=?").get(id);
  if (!verifyTrackingToken(row, trackingToken)) return null;
  if (row.status !== "CHANGES_REQUESTED") throw Object.assign(new Error("Only a submission with requested changes can be resubmitted."), { code: "RESUBMISSION_NOT_ALLOWED" });
  const evidence = Array.isArray(patch.evidence) ? patch.evidence : parsed(row.evidence_json, []);
  const notes = typeof patch.notes === "string" ? patch.notes : row.notes;
  const ts = now();
  db.prepare("UPDATE submissions SET evidence_json=?,notes=?,status='SUBMITTED',reviewer_notes=NULL,updated_at=? WHERE id=?")
    .run(json(evidence), notes, ts, id);
  addSubmissionEvent(db, id, "RESUBMITTED", { evidenceCount: evidence.length }, "applicant");
  return normalizeRow(db.prepare("SELECT * FROM submissions WHERE id=?").get(id));
}
export function cancelTrackedSubmission(db, id, trackingToken) {
  const row = db.prepare("SELECT * FROM submissions WHERE id=?").get(id);
  if (!verifyTrackingToken(row, trackingToken)) return null;
  if (!new Set(["SUBMITTED", "CHANGES_REQUESTED"]).has(row.status)) throw Object.assign(new Error("This submission can no longer be cancelled."), { code: "CANCELLATION_NOT_ALLOWED" });
  db.prepare("UPDATE submissions SET status='CANCELLED',updated_at=? WHERE id=?").run(now(), id);
  addSubmissionEvent(db, id, "CANCELLED", null, "applicant");
  return normalizeRow(db.prepare("SELECT * FROM submissions WHERE id=?").get(id));
}

export function listSubmissions(db, status) { return listSubmissionsFiltered(db, { status }); }
export function listSubmissionsFiltered(db, options = {}) {
  const where = []; const params = [];
  if (options.status) { where.push("status=?"); params.push(String(options.status)); }
  if (options.query) {
    const q = `%${String(options.query).trim().slice(0, 200).replace(/[\\%_]/g, "\\$&")}%`;
    where.push("(applicant_name LIKE ? ESCAPE '\\' OR applicant_email LIKE ? ESCAPE '\\' OR credential_title LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\' OR recipient_lock_hash LIKE ? ESCAPE '\\')");
    params.push(q, q, q, q, q);
  }
  const limit = boundedInt(options.limit, 100, 1, 250);
  const offset = boundedInt(options.offset, 0, 0, 100000);
  const sql = `SELECT * FROM submissions ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  return db.prepare(sql).all(...params, limit, offset).map(normalizeRow);
}

export function getSubmission(db, id) { return normalizeRow(db.prepare("SELECT * FROM submissions WHERE id=?").get(id)); }

export function createSubmissionAttachment(db, submissionId, metadata) {
  const id = metadata.id ?? crypto.randomUUID(); const ts = now();
  db.prepare("INSERT INTO submission_attachments(id,submission_id,file_name,mime_type,sha256,byte_length,storage_relpath,created_at) VALUES(?,?,?,?,?,?,?,?)")
    .run(id, submissionId, metadata.fileName, metadata.mimeType, metadata.sha256, Number(metadata.byteLength), metadata.storageRelpath, ts);
  addSubmissionEvent(db, submissionId, "ATTACHMENT_ADDED", { attachmentId: id, fileName: metadata.fileName, mimeType: metadata.mimeType, sha256: metadata.sha256, byteLength: Number(metadata.byteLength) }, metadata.actor ?? "applicant");
  return getSubmissionAttachment(db, id);
}
export function getSubmissionAttachment(db, id) { return db.prepare("SELECT * FROM submission_attachments WHERE id=?").get(id) ?? null; }
export function listSubmissionAttachments(db, submissionId) { return db.prepare("SELECT * FROM submission_attachments WHERE submission_id=? ORDER BY created_at ASC").all(submissionId); }
export function listAllSubmissionAttachments(db) { return db.prepare("SELECT * FROM submission_attachments ORDER BY created_at ASC").all(); }
export function deleteSubmissionAttachment(db, id, actor = "applicant") {
  const row = getSubmissionAttachment(db, id); if (!row) return null;
  db.prepare("DELETE FROM submission_attachments WHERE id=?").run(id);
  addSubmissionEvent(db, row.submission_id, "ATTACHMENT_REMOVED", { attachmentId: id, fileName: row.file_name, sha256: row.sha256 }, actor);
  return row;
}

export function updateSubmission(db, id, patch, actor = "system") {
  const before = getSubmission(db, id);
  const allowed = new Map([
    ["status", "status"], ["ai", "ai_json"], ["reviewerNotes", "reviewer_notes"], ["issuedCredentialId", "issued_credential_id"]
  ]);
  const entries = Object.entries(patch).filter(([key]) => allowed.has(key));
  if (!entries.length) return before;
  const sets = entries.map(([key]) => `${allowed.get(key)}=?`);
  const values = entries.map(([key, value]) => key === "ai" ? json(value) : value);
  sets.push("updated_at=?"); values.push(now(), id);
  db.prepare(`UPDATE submissions SET ${sets.join(", ")} WHERE id=?`).run(...values);
  const after = getSubmission(db, id);
  if (patch.status && patch.status !== before?.status) addSubmissionEvent(db, id, String(patch.status), { from: before?.status ?? null, reviewerNotes: patch.reviewerNotes ?? null }, actor);
  return after;
}

export function upsertProfile(db, recipientLockHash, input = {}) {
  const ts = now();
  db.prepare(`INSERT INTO profiles(recipient_lock_hash,display_name,bio,created_at,updated_at)
    VALUES(?,?,?,?,?) ON CONFLICT(recipient_lock_hash) DO UPDATE SET display_name=excluded.display_name,bio=excluded.bio,updated_at=excluded.updated_at`)
    .run(recipientLockHash.toLowerCase(), input.displayName ?? null, input.bio ?? null, ts, ts);
}
export function getProfile(db, lockHash) { return db.prepare("SELECT * FROM profiles WHERE recipient_lock_hash=?").get(lockHash.toLowerCase()) ?? null; }
export function listProfiles(db, limit = 250) { return db.prepare("SELECT * FROM profiles ORDER BY updated_at DESC LIMIT ?").all(boundedInt(limit, 250, 1, 1000)); }

export function createOperation(db, kind, credentialId, status, chain = null, error = null) {
  const id = crypto.randomUUID(); const ts = now();
  db.prepare("INSERT INTO operations(id,kind,credential_id,status,chain_json,error,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
    .run(id, kind, credentialId, status, json(chain), error, ts, ts);
  return { id, kind, credentialId, status, chain, error, createdAt: ts, updatedAt: ts };
}
export function updateOperation(db, id, status, chain = null, error = null) {
  db.prepare("UPDATE operations SET status=?,chain_json=?,error=?,updated_at=? WHERE id=?").run(status, json(chain), error, now(), id);
  return normalizeRow(db.prepare("SELECT * FROM operations WHERE id=?").get(id));
}
export function latestOperation(db, credentialId) {
  return normalizeRow(db.prepare("SELECT * FROM operations WHERE credential_id=? ORDER BY created_at DESC LIMIT 1").get(credentialId));
}
export function listOperations(db, options = {}) {
  const status = options.status ? String(options.status) : null;
  const limit = boundedInt(options.limit, 100, 1, 500);
  const rows = status ? db.prepare("SELECT * FROM operations WHERE status=? ORDER BY created_at DESC LIMIT ?").all(status, limit)
    : db.prepare("SELECT * FROM operations ORDER BY created_at DESC LIMIT ?").all(limit);
  return rows.map(normalizeRow);
}

export function audit(db, actor, action, targetType, targetId, detail = null) {
  db.prepare("INSERT INTO audit_events(id,actor,action,target_type,target_id,detail_json,created_at) VALUES(?,?,?,?,?,?,?)")
    .run(crypto.randomUUID(), actor, action, targetType, targetId, json(detail), now());
}
export function listAudit(db, limit = 200) {
  return db.prepare("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ?").all(boundedInt(limit, 200, 1, 500)).map(normalizeRow);
}

export function getAdminStats(db) {
  const statusRows = db.prepare("SELECT status, COUNT(*) AS count FROM submissions GROUP BY status").all();
  const operationRows = db.prepare("SELECT status, COUNT(*) AS count FROM operations GROUP BY status").all();
  const statuses = Object.fromEntries(statusRows.map((row) => [row.status, Number(row.count)]));
  const operations = Object.fromEntries(operationRows.map((row) => [row.status, Number(row.count)]));
  return {
    submissions: { total: statusRows.reduce((sum, row) => sum + Number(row.count), 0), byStatus: statuses },
    operations: { total: operationRows.reduce((sum, row) => sum + Number(row.count), 0), byStatus: operations },
    profiles: Number(db.prepare("SELECT COUNT(*) AS count FROM profiles").get().count),
    auditEvents: Number(db.prepare("SELECT COUNT(*) AS count FROM audit_events").get().count),
    attachments: Number(db.prepare("SELECT COUNT(*) AS count FROM submission_attachments").get().count)
  };
}

export function createWebhookDelivery(db, eventType, targetUrl, payload) {
  const id = crypto.randomUUID(); const ts = now();
  db.prepare("INSERT INTO webhook_deliveries(id,event_type,target_url,status,payload_json,created_at,updated_at) VALUES(?,?,?,'PENDING',?,?,?)")
    .run(id, eventType, targetUrl, json(payload), ts, ts);
  return { id, eventType, targetUrl, status: "PENDING", payload, createdAt: ts, updatedAt: ts };
}
export function updateWebhookDelivery(db, id, status, httpStatus = null, error = null) {
  db.prepare("UPDATE webhook_deliveries SET status=?,http_status=?,error=?,updated_at=? WHERE id=?").run(status, httpStatus, error, now(), id);
  return normalizeRow(db.prepare("SELECT * FROM webhook_deliveries WHERE id=?").get(id));
}
export function listWebhookDeliveries(db, limit = 100) {
  return db.prepare("SELECT * FROM webhook_deliveries ORDER BY created_at DESC LIMIT ?").all(boundedInt(limit, 100, 1, 500)).map(normalizeRow);
}

export function exportOperationalSnapshot(db) {
  return {
    schema: "ckbuilder-product-snapshot/v1",
    exportedAt: now(),
    profiles: db.prepare("SELECT recipient_lock_hash,display_name,bio,created_at,updated_at FROM profiles ORDER BY created_at").all(),
    submissions: db.prepare("SELECT id,applicant_name,applicant_email,recipient_lock_hash,credential_type,credential_title,category,evidence_json,notes,status,ai_json,reviewer_notes,issued_credential_id,created_at,updated_at FROM submissions ORDER BY created_at").all().map(normalizeRow),
    submissionEvents: db.prepare("SELECT id,submission_id,actor,event_type,detail_json,created_at FROM submission_events ORDER BY created_at").all().map(normalizeRow),
    submissionAttachments: db.prepare("SELECT id,submission_id,file_name,mime_type,sha256,byte_length,created_at FROM submission_attachments ORDER BY created_at").all(),
    operations: db.prepare("SELECT * FROM operations ORDER BY created_at").all().map(normalizeRow),
    auditEvents: db.prepare("SELECT * FROM audit_events ORDER BY created_at").all().map(normalizeRow),
    webhookDeliveries: db.prepare("SELECT * FROM webhook_deliveries ORDER BY created_at").all().map(normalizeRow)
  };
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.pbkdf2Sync(password, salt, 310000, 32, "sha256").toString("hex");
  return `pbkdf2-sha256$310000$${salt}$${derived}`;
}
export function verifyPassword(password, encoded) {
  const [kind, iter, salt, expected] = String(encoded).split("$");
  if (kind !== "pbkdf2-sha256" || !salt || !expected) return false;
  const iterations = Number(iter);
  if (!Number.isSafeInteger(iterations) || iterations < 100000 || iterations > 2000000) return false;
  const actual = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
  const a = Buffer.from(actual); const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export function ensureBootstrapAdmin(db, email, password, displayName = "CKBuilder Admin") {
  if (!email || !password) return;
  const existing = db.prepare("SELECT id FROM users WHERE email=?").get(email.toLowerCase());
  if (existing) return;
  db.prepare("INSERT INTO users(id,email,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)")
    .run(crypto.randomUUID(), email.toLowerCase(), displayName, hashPassword(password), "admin", now());
}
export function findUserByEmail(db, email) { return db.prepare("SELECT * FROM users WHERE email=?").get(String(email).toLowerCase()) ?? null; }
