import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { AppError, formatError } from "./errors.js";
import { readJsonBody, safeStaticPath, securityHeaders, sendJson, validatePublicSubmission } from "./inspector-http.js";
import { aiAgentCatalog, analyzeEvidence, aiProviderCatalog } from "./ai-service.js";
import {
  audit, createOperation, createSubmission, ensureBootstrapAdmin, exportOperationalSnapshot, findUserByEmail,
  getAdminStats, getSubmission, listAudit, listOperations, listSubmissionsFiltered, listWebhookDeliveries,
  updateOperation, updateSubmission, verifyPassword, upsertProfile
} from "./product-db.js";
import { clearSessionCookie, createSessionToken, parseCookies, sessionCookie, verifySessionToken } from "./session-auth.js";
import { prepareCredential, persistPreparedCredential, prepareRevocation, persistPreparedRevocation } from "./credential-service.js";
import { loadLedger } from "./ledger.js";
import { portableCredential } from "./credential-artifact.js";
import { verifyEvidenceReferences } from "./evidence-checks.js";
import { deliverWebhook, validateWebhookUrl } from "./webhook-service.js";
import { auditAttachmentStorage, listAttachmentMetadata, previewSubmissionAttachment, readSubmissionAttachment } from "./attachment-service.js";

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };
function headers(response, status, extra = {}) { response.writeHead(status, { ...securityHeaders(), ...extra }); }
function clean(value, name, max = 500) { const text = String(value ?? "").trim(); if (!text) throw new AppError("INPUT_INVALID", `${name} is required.`); if (text.length > max) throw new AppError("INPUT_TOO_LONG", `${name} is too long.`); return text; }
function secureRequest(request, trustProxy = false) {
  if (request.socket?.encrypted) return true;
  return trustProxy && String(request.headers["x-forwarded-proto"] ?? "").split(",")[0].trim() === "https";
}
function clientAddress(request, trustProxy = false) {
  const peer = String(request.socket?.remoteAddress ?? "unknown").trim();
  if (!trustProxy) return peer;
  const forwarded = String(request.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  return forwarded || peer;
}
function currentUser(request, secret) { return verifySessionToken(parseCookies(request.headers.cookie).ckbuilder_session, secret); }
function requireAdmin(request, secret) { const user = currentUser(request, secret); if (!user || user.role !== "admin") throw new AppError("AUTH_REQUIRED", "Administrator sign-in is required."); return user; }
function ensureIssuerConfig(config) {
  if (!config.SESSION_SECRET || config.SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
  if (!config.ADMIN_EMAIL || !config.ADMIN_PASSWORD) throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required for issuer portal bootstrap.");
  if (String(config.ADMIN_PASSWORD).length < 12) throw new Error("ADMIN_PASSWORD must contain at least 12 characters.");
  if (config.WEBHOOK_URL) {
    validateWebhookUrl(config.WEBHOOK_URL);
    if (String(config.WEBHOOK_SECRET ?? "").length < 24) throw new Error("WEBHOOK_SECRET must contain at least 24 characters when WEBHOOK_URL is configured.");
  }
}
function certificatePath(config, credentialId) {
  const safe = credentialId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100);
  return path.join(config.DATA_DIR, "issued-documents", `${safe}.json`);
}
function writeCertificateSource(config, submission, credentialId) {
  const file = certificatePath(config, credentialId); fs.mkdirSync(path.dirname(file), { recursive: true });
  const doc = {
    schema: "ckbuilder-issued-certificate/v1", credentialId, holder: submission.applicant_name,
    credentialType: submission.credential_type, title: submission.credential_title, category: submission.category,
    recipientLockHash: submission.recipient_lock_hash, issuer: config.ISSUER_NAME, issuedAt: new Date().toISOString().slice(0, 10),
    evidenceReferences: submission.evidence ?? []
  };
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, { mode: 0o600 }); return file;
}
function credentialIdFor(submission) { return `CKB-${String(submission.credential_type).replace(/[^A-Za-z0-9]/g, "-").toUpperCase().slice(0, 24)}-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`; }

async function issueSubmission({ config, db, submission, actor }) {
  if (submission.status === "ISSUED") throw new AppError("ALREADY_ISSUED", "This submission already has an issued credential.");
  const credentialId = credentialIdFor(submission);
  const documentPath = writeCertificateSource(config, submission, credentialId);
  const input = {
    credentialId, recipientLockHash: submission.recipient_lock_hash, credentialType: submission.credential_type,
    studentId: submission.applicant_email, identitySalt: crypto.randomBytes(32).toString("hex"),
    degreeTitle: submission.credential_title, fieldOfStudy: submission.category,
    classification: submission.credential_type, issuedAt: new Date().toISOString().slice(0, 10)
  };
  const prepared = prepareCredential(config, input, documentPath);
  const operation = createOperation(db, "ISSUE", credentialId, "PREPARED");
  let chain = null;
  try {
    if (config.CHAIN_WRITE_MODE !== "disabled") {
      updateOperation(db, operation.id, "CHAIN_PENDING");
      const { createActiveRecord } = await import("../ckb/local-chain.js");
      chain = await createActiveRecord(config, credentialId);
      updateOperation(db, operation.id, "CHAIN_COMMITTED", chain);
    }
    persistPreparedCredential(config, prepared);
    const finalStatus = chain ? "ACTIVE" : "ACTIVE_OFFCHAIN";
    updateOperation(db, operation.id, finalStatus, chain);
    updateSubmission(db, submission.id, { status: "ISSUED", issuedCredentialId: credentialId }, actor.email);
    upsertProfile(db, submission.recipient_lock_hash, { displayName: submission.applicant_name });
    audit(db, actor.email, "credential.issue", "credential", credentialId, { submissionId: submission.id, chainStatus: chain ? "committed" : "disabled" });
    return { credentialId, status: finalStatus, chain, portable: portableCredential(prepared.record, config.PUBLIC_BASE_URL) };
  } catch (error) {
    updateOperation(db, operation.id, "FAILED", chain, error.message);
    updateSubmission(db, submission.id, { status: "ISSUE_FAILED", reviewerNotes: error.message }, actor.email);
    throw error;
  }
}

async function revokeCredentialWorkflow({ config, db, credentialId, reasonCode, reason, actor }) {
  const prepared = prepareRevocation(config, credentialId, reasonCode, reason);
  const operation = createOperation(db, "REVOKE", credentialId, "PREPARED");
  let chain = null;
  try {
    if (config.CHAIN_WRITE_MODE !== "disabled") {
      updateOperation(db, operation.id, "CHAIN_PENDING");
      const { revokeRecord } = await import("../ckb/local-chain.js");
      chain = await revokeRecord(config, credentialId, reasonCode);
      updateOperation(db, operation.id, "CHAIN_COMMITTED", chain);
    }
    persistPreparedRevocation(config, credentialId, prepared);
    const finalStatus = chain ? "REVOKED" : "REVOKED_OFFCHAIN";
    updateOperation(db, operation.id, finalStatus, chain);
    audit(db, actor.email, "credential.revoke", "credential", credentialId, { reasonCode, reason, chainStatus: chain ? "committed" : "disabled" });
    return { credentialId, status: finalStatus, chain };
  } catch (error) {
    updateOperation(db, operation.id, "FAILED", chain, error.message); throw error;
  }
}

export function createIssuerServer({ config, publicDir, db, logger = console }) {
  ensureIssuerConfig(config);
  ensureBootstrapAdmin(db, config.ADMIN_EMAIL, config.ADMIN_PASSWORD);
  async function notify(eventType, payload) {
    if (!config.WEBHOOK_URL) return { skipped: true };
    const result = await deliverWebhook({ db, url: config.WEBHOOK_URL, secret: config.WEBHOOK_SECRET, eventType, payload });
    if (!result.delivered && !result.skipped) logger.error?.(`[webhook] ${eventType}: ${result.error}`);
    return result;
  }
  const loginAttempts = new Map();
  function checkLoginRate(request) {
    const ip = clientAddress(request, config.TRUST_PROXY === true);
    const ts = Date.now(); const item = loginAttempts.get(ip);
    if (!item || ts - item.start > 10 * 60 * 1000) {
      loginAttempts.set(ip, { start: ts, count: 1 });
      if (loginAttempts.size > 5000) {
        for (const [key, value] of loginAttempts) if (ts - value.start > 10 * 60 * 1000) loginAttempts.delete(key);
        while (loginAttempts.size > 5000) loginAttempts.delete(loginAttempts.keys().next().value);
      }
      return;
    }
    item.count += 1; if (item.count > 8) throw new AppError("RATE_LIMITED", "Too many sign-in attempts. Try again later.");
  }
  return http.createServer(async (request, response) => {
    const requestId = crypto.randomUUID();
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { ok: true, service: "CKBuilder Issuer Portal", version: "10.1.0", network: config.APP_NETWORK, chainWriteMode: config.CHAIN_WRITE_MODE, signingKeysLoaded: true, htmlSupport: true, submissionAttachments: true }, requestId); return;
      }
      if (request.method === "POST" && url.pathname === "/api/auth/login") {
        checkLoginRate(request);
        const body = await readJsonBody(request, 32 * 1024); const user = findUserByEmail(db, clean(body.email, "email", 254));
        if (!user || !verifyPassword(String(body.password ?? ""), user.password_hash)) throw new AppError("AUTH_INVALID", "Invalid email or password.");
        const token = createSessionToken(user, config.SESSION_SECRET);
        const payload = `${JSON.stringify({ ok: true, user: { email: user.email, displayName: user.display_name, role: user.role } }, null, 2)}\n`;
        headers(response, 200, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(payload), "cache-control": "no-store", "x-request-id": requestId, "set-cookie": sessionCookie(token, secureRequest(request, config.TRUST_PROXY === true)) });
        response.end(payload); return;
      }
      if (request.method === "POST" && url.pathname === "/api/auth/logout") {
        headers(response, 200, { "content-type": "application/json; charset=utf-8", "set-cookie": clearSessionCookie(secureRequest(request, config.TRUST_PROXY === true)) }); response.end('{"ok":true}\n'); return;
      }
      if (request.method === "GET" && url.pathname === "/api/admin/me") {
        const user = requireAdmin(request, config.SESSION_SECRET); sendJson(response, 200, user, requestId); return;
      }
      if (request.method === "GET" && url.pathname === "/api/admin/submissions") {
        requireAdmin(request, config.SESSION_SECRET);
        sendJson(response, 200, { submissions: listSubmissionsFiltered(db, {
          status: url.searchParams.get("status") || undefined, query: url.searchParams.get("q") || undefined,
          limit: url.searchParams.get("limit"), offset: url.searchParams.get("offset")
        }) }, requestId); return;
      }
      if (request.method === "POST" && url.pathname === "/api/admin/submissions/bulk") {
        const user = requireAdmin(request, config.SESSION_SECRET); const body = await readJsonBody(request, 1024 * 1024);
        if (!Array.isArray(body.submissions) || body.submissions.length < 1 || body.submissions.length > 50) throw new AppError("BULK_INPUT_INVALID", "submissions must contain between 1 and 50 items.");
        const created = body.submissions.map((item) => createSubmission(db, validatePublicSubmission(item)));
        audit(db, user.email, "submission.bulk_create", "submission_batch", requestId, { count: created.length });
        await notify("submission.bulk_created", { count: created.length, ids: created.map((item) => item.id) });
        sendJson(response, 201, { created }, requestId); return;
      }
      if (request.method === "GET" && /^\/api\/admin\/submissions\/[^/]+\/attachments$/.test(url.pathname)) {
        requireAdmin(request, config.SESSION_SECRET); const id = decodeURIComponent(url.pathname.split("/")[4]);
        const submission = getSubmission(db, id); if (!submission) throw new AppError("SUBMISSION_NOT_FOUND", "Submission not found.");
        sendJson(response, 200, { attachments: listAttachmentMetadata(db, id) }, requestId); return;
      }
      if (request.method === "GET" && /^\/api\/admin\/attachments\/[^/]+\/download$/.test(url.pathname)) {
        requireAdmin(request, config.SESSION_SECRET); const attachmentId = decodeURIComponent(url.pathname.split("/")[4]);
        const item = readSubmissionAttachment(config, db, attachmentId);
        if (!item) { sendJson(response, 404, { error: "ATTACHMENT_NOT_FOUND" }, requestId); return; }
        const safeName = item.metadata.fileName.replace(/[\r\n"\\]/g, "_").slice(0, 180);
        headers(response, 200, { "content-type": "application/octet-stream", "content-length": item.bytes.length, "content-disposition": `attachment; filename="${safeName}"`, "cache-control": "no-store", "x-content-type-options": "nosniff", "x-request-id": requestId });
        response.end(item.bytes); return;
      }
      if (request.method === "GET" && /^\/api\/admin\/attachments\/[^/]+\/preview$/.test(url.pathname)) {
        requireAdmin(request, config.SESSION_SECRET); const attachmentId = decodeURIComponent(url.pathname.split("/")[4]);
        const item = previewSubmissionAttachment(config, db, attachmentId);
        if (!item) { sendJson(response, 404, { error: "ATTACHMENT_NOT_FOUND" }, requestId); return; }
        const inspected = item.inspected;
        if (inspected.mimeType === "text/html") {
          const html = inspected.safeHtml; headers(response, 200, { "content-type": "text/html; charset=utf-8", "content-length": Buffer.byteLength(html), "cache-control": "no-store", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'", "x-request-id": requestId }); response.end(html); return;
        }
        if (inspected.textExtracted) {
          const text = inspected.textExcerpt ?? ""; headers(response, 200, { "content-type": "text/plain; charset=utf-8", "content-length": Buffer.byteLength(text), "cache-control": "no-store", "content-security-policy": "default-src 'none'; frame-ancestors 'self'", "x-request-id": requestId }); response.end(text); return;
        }
        if (new Set(["image/png","image/jpeg","image/webp"]).has(item.metadata.mimeType)) {
          headers(response, 200, { "content-type": item.metadata.mimeType, "content-length": item.bytes.length, "cache-control": "no-store", "content-security-policy": "default-src 'none'; frame-ancestors 'self'", "x-request-id": requestId }); response.end(item.bytes); return;
        }
        throw new AppError("ATTACHMENT_PREVIEW_UNAVAILABLE", "This attachment type is download-only.");
      }

      if (request.method === "GET" && url.pathname === "/api/admin/attachments/audit") {
        requireAdmin(request, config.SESSION_SECRET); sendJson(response, 200, auditAttachmentStorage(config, db), requestId); return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/stats") {
        requireAdmin(request, config.SESSION_SECRET); const ledger = loadLedger(config.DATA_DIR);
        const credentialRows = Object.values(ledger.credentials);
        sendJson(response, 200, { ...getAdminStats(db), credentials: { total: credentialRows.length, active: credentialRows.filter((r) => r.status === "ACTIVE").length, revoked: credentialRows.filter((r) => r.status === "REVOKED").length } }, requestId); return;
      }
      if (request.method === "GET" && url.pathname === "/api/admin/operations") {
        requireAdmin(request, config.SESSION_SECRET); sendJson(response, 200, { operations: listOperations(db, { status: url.searchParams.get("status"), limit: url.searchParams.get("limit") }) }, requestId); return;
      }
      if (request.method === "GET" && url.pathname === "/api/admin/webhooks") {
        requireAdmin(request, config.SESSION_SECRET); sendJson(response, 200, { deliveries: listWebhookDeliveries(db, url.searchParams.get("limit")) }, requestId); return;
      }
      if (request.method === "GET" && url.pathname === "/api/admin/export") {
        requireAdmin(request, config.SESSION_SECRET); sendJson(response, 200, { product: exportOperationalSnapshot(db), ledger: loadLedger(config.DATA_DIR) }, requestId); return;
      }
      if (request.method === "GET" && url.pathname === "/api/admin/audit") {
        requireAdmin(request, config.SESSION_SECRET); sendJson(response, 200, { events: listAudit(db) }, requestId); return;
      }
      if (request.method === "POST" && /^\/api\/admin\/submissions\/[^/]+\/check$/.test(url.pathname)) {
        requireAdmin(request, config.SESSION_SECRET); const id = decodeURIComponent(url.pathname.split("/")[4]); const submission = getSubmission(db, id);
        if (!submission) throw new AppError("SUBMISSION_NOT_FOUND", "Submission not found.");
        const evidenceInput = { credentialType: submission.credential_type, credentialTitle: submission.credential_title, category: submission.category, evidence: submission.evidence, notes: submission.notes };
        const deterministicEvidence = await verifyEvidenceReferences(config, evidenceInput);
        const prior = submission.ai ?? {}; updateSubmission(db, id, { ai: { ...prior, deterministicEvidence } });
        sendJson(response, 200, deterministicEvidence, requestId); return;
      }

      if (request.method === "POST" && /^\/api\/admin\/submissions\/[^/]+\/ai$/.test(url.pathname)) {
        requireAdmin(request, config.SESSION_SECRET); const id = decodeURIComponent(url.pathname.split("/")[4]); const submission = getSubmission(db, id);
        if (!submission) throw new AppError("SUBMISSION_NOT_FOUND", "Submission not found.");
        const evidenceInput = { credentialType: submission.credential_type, credentialTitle: submission.credential_title, category: submission.category, evidence: submission.evidence, notes: submission.notes };
        const deterministicEvidence = await verifyEvidenceReferences(config, evidenceInput);
        const attachments = listAttachmentMetadata(db, id).map((meta) => {
          try { const preview = previewSubmissionAttachment(config, db, meta.id); return { ...meta, textExcerpt: preview?.inspected?.textExcerpt?.slice(0, 10000) ?? null }; }
          catch { return { ...meta, textExcerpt: null }; }
        });
        const result = await analyzeEvidence(request.headers, { ...evidenceInput, deterministicEvidence, attachments }, config.AI_DEFAULT_MODEL, config.AI_DEFAULT_PROVIDER);
        const saved = { ...result, deterministicEvidence }; updateSubmission(db, id, { ai: saved }); sendJson(response, 200, saved, requestId); return;
      }
      if (request.method === "POST" && /^\/api\/admin\/submissions\/[^/]+\/review$/.test(url.pathname)) {
        const user = requireAdmin(request, config.SESSION_SECRET); const id = decodeURIComponent(url.pathname.split("/")[4]); const submission = getSubmission(db, id);
        if (!submission) throw new AppError("SUBMISSION_NOT_FOUND", "Submission not found.");
        const body = await readJsonBody(request, 64 * 1024); const action = clean(body.action, "action", 40); const notes = String(body.notes ?? "").trim().slice(0, 5000);
        if (submission.status !== "SUBMITTED") throw new AppError("REVIEW_STATE_INVALID", `Submission status ${submission.status} cannot be reviewed. Applicants must resubmit requested changes before another review.`);
        if (action === "approve") {
          updateSubmission(db, id, { status: "APPROVED", reviewerNotes: notes }, user.email);
          const issued = await issueSubmission({ config, db, submission: getSubmission(db, id), actor: user });
          await notify("credential.issued", { credentialId: issued.credentialId, submissionId: id, status: issued.status });
          sendJson(response, 200, issued, requestId); return;
        }
        if (action === "request_changes") { updateSubmission(db, id, { status: "CHANGES_REQUESTED", reviewerNotes: notes }, user.email); audit(db, user.email, "submission.request_changes", "submission", id, { notes }); await notify("submission.changes_requested", { submissionId: id }); sendJson(response, 200, getSubmission(db, id), requestId); return; }
        if (action === "reject") { updateSubmission(db, id, { status: "REJECTED", reviewerNotes: notes }, user.email); audit(db, user.email, "submission.reject", "submission", id, { notes }); await notify("submission.rejected", { submissionId: id }); sendJson(response, 200, getSubmission(db, id), requestId); return; }
        throw new AppError("REVIEW_ACTION_INVALID", "action must be approve, request_changes, or reject.");
      }
      if (request.method === "POST" && /^\/api\/admin\/credentials\/[^/]+\/revoke$/.test(url.pathname)) {
        const user = requireAdmin(request, config.SESSION_SECRET); const credentialId = decodeURIComponent(url.pathname.split("/")[4]); const body = await readJsonBody(request, 32 * 1024);
        const revoked = await revokeCredentialWorkflow({ config, db, credentialId, reasonCode: Number(body.reasonCode ?? 1), reason: clean(body.reason, "reason", 1000), actor: user });
        await notify("credential.revoked", { credentialId, status: revoked.status, reasonCode: Number(body.reasonCode ?? 1) });
        sendJson(response, 200, revoked, requestId); return;
      }
      if (request.method === "GET" && url.pathname === "/api/admin/credentials") {
        requireAdmin(request, config.SESSION_SECRET); const ledger = loadLedger(config.DATA_DIR);
        sendJson(response, 200, { credentials: Object.values(ledger.credentials).map((r) => portableCredential(r, config.PUBLIC_BASE_URL)) }, requestId); return;
      }
      if (request.method === "GET" && url.pathname === "/api/config") {
        sendJson(response, 200, { network: config.APP_NETWORK, chainWriteMode: config.CHAIN_WRITE_MODE, publicBaseUrl: config.PUBLIC_BASE_URL ?? "", aiProviders: aiProviderCatalog(config.AI_DEFAULT_PROVIDER, config.AI_DEFAULT_MODEL), aiAgents: aiAgentCatalog(), aiDefaultProvider: config.AI_DEFAULT_PROVIDER, aiDefaultModel: config.AI_DEFAULT_MODEL, webhookEnabled: Boolean(config.WEBHOOK_URL), htmlSupport: true, submissionAttachments: true }, requestId); return;
      }
      if (request.method !== "GET") { sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" }, requestId); return; }
      const file = safeStaticPath(publicDir, url.pathname); if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) { sendJson(response, 404, { error: "NOT_FOUND" }, requestId); return; }
      const body = fs.readFileSync(file); headers(response, 200, { "content-type": types[path.extname(file)] ?? "application/octet-stream", "content-length": body.length, "cache-control": file.endsWith("index.html") ? "no-store" : "public, max-age=300" }); response.end(body);
    } catch (error) {
      logger.error?.(formatError(error)); const code = error?.code; const status = code === "AUTH_REQUIRED" || code === "AUTH_INVALID" ? 401 : code === "RATE_LIMITED" ? 429 : code === "SUBMISSION_NOT_FOUND" ? 404 : code === "REVIEW_STATE_INVALID" ? 409 : 400;
      sendJson(response, status, { error: error instanceof AppError ? error.code : "ISSUER_OPERATION_FAILED", message: error instanceof AppError ? error.message : "Issuer operation failed. Review server logs and chain configuration." }, requestId);
    }
  });
}
