import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AppError } from "./errors.js";
import { decodeDocumentInput, inspectDocumentInput } from "./document-service.js";
import { createSubmissionAttachment, deleteSubmissionAttachment, getSubmissionAttachment, listAllSubmissionAttachments, listSubmissionAttachments } from "./product-db.js";

function attachmentRoot(config) {
  const root = path.join(config.DATA_DIR, "product-attachments");
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(root, 0o700); } catch {}
  return root;
}
function relPath(submissionId, attachmentId) { return path.join(String(submissionId), `${attachmentId}.bin`); }
function absolutePath(config, storageRelpath) {
  const root = path.resolve(attachmentRoot(config));
  const absolute = path.resolve(root, storageRelpath);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new AppError("ATTACHMENT_PATH_INVALID", "Attachment storage path is invalid.");
  return absolute;
}
function publicMetadata(row) {
  return row ? { id: row.id, submissionId: row.submission_id, fileName: row.file_name, mimeType: row.mime_type, sha256: row.sha256, byteLength: Number(row.byte_length), createdAt: row.created_at } : null;
}
export function storeSubmissionAttachment(config, db, submissionId, input, actor = "applicant") {
  const parsed = decodeDocumentInput(input, { maxBytes: 5 * 1024 * 1024 });
  const id = crypto.randomUUID();
  const storageRelpath = relPath(submissionId, id);
  const target = absolutePath(config, storageRelpath);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  try { fs.chmodSync(path.dirname(target), 0o700); } catch {}
  fs.writeFileSync(target, parsed.bytes, { mode: 0o600, flag: "wx" });
  const sha256 = crypto.createHash("sha256").update(parsed.bytes).digest("hex");
  try {
    const row = createSubmissionAttachment(db, submissionId, { id, actor, fileName: parsed.fileName, mimeType: parsed.mimeType, sha256, byteLength: parsed.bytes.length, storageRelpath });
    return publicMetadata(row);
  } catch (error) {
    fs.rmSync(target, { force: true });
    throw error;
  }
}
export function listAttachmentMetadata(db, submissionId) { return listSubmissionAttachments(db, submissionId).map(publicMetadata); }
export function removeSubmissionAttachment(config, db, submissionId, attachmentId, actor = "applicant") {
  const row = getSubmissionAttachment(db, attachmentId);
  if (!row || row.submission_id !== submissionId) return null;
  const removed = deleteSubmissionAttachment(db, attachmentId, actor);
  if (removed) fs.rmSync(absolutePath(config, removed.storage_relpath), { force: true });
  return publicMetadata(removed);
}
export function readSubmissionAttachment(config, db, attachmentId) {
  const row = getSubmissionAttachment(db, attachmentId);
  if (!row) return null;
  const file = absolutePath(config, row.storage_relpath);
  if (!fs.existsSync(file)) throw new AppError("ATTACHMENT_FILE_MISSING", "Attachment metadata exists but the stored file is missing.");
  const bytes = fs.readFileSync(file);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== row.sha256 || bytes.length !== Number(row.byte_length)) throw new AppError("ATTACHMENT_INTEGRITY_FAILED", "Stored attachment no longer matches its recorded digest.");
  return { metadata: publicMetadata(row), bytes };
}
export function previewSubmissionAttachment(config, db, attachmentId) {
  const item = readSubmissionAttachment(config, db, attachmentId);
  if (!item) return null;
  const inspected = inspectDocumentInput({ fileName: item.metadata.fileName, mimeType: item.metadata.mimeType, documentBase64: item.bytes.toString("base64") }, { maxBytes: 5 * 1024 * 1024, maxTextChars: 50000 });
  return { metadata: item.metadata, inspected };
}

export function auditAttachmentStorage(config, db) {
  const rows = listAllSubmissionAttachments(db); const expected = new Set(); const missing = []; const tampered = [];
  for (const row of rows) {
    expected.add(path.normalize(row.storage_relpath));
    let item; try { item = readSubmissionAttachment(config, db, row.id); } catch (error) { if (error?.code === "ATTACHMENT_FILE_MISSING") missing.push({ id: row.id, fileName: row.file_name }); else tampered.push({ id: row.id, fileName: row.file_name, error: error?.code ?? "ATTACHMENT_INTEGRITY_FAILED" }); continue; }
    if (!item) missing.push({ id: row.id, fileName: row.file_name });
  }
  const root = attachmentRoot(config); const orphaned = [];
  function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isSymbolicLink()) { orphaned.push(path.relative(root, full)); continue; } if (entry.isDirectory()) walk(full); else if (entry.isFile()) { const rel = path.normalize(path.relative(root, full)); if (!expected.has(rel)) orphaned.push(rel); } } }
  if (fs.existsSync(root)) walk(root);
  return { ok: missing.length === 0 && tampered.length === 0 && orphaned.length === 0, checked: rows.length, missing, tampered, orphaned };
}
