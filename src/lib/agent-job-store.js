import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AppError } from "./errors.js";
import { readJson } from "./json.js";

const LEGACY_SCHEMA = "ckbuilder-agent-job-ledger/v1";
const DB_SCHEMA = "ckbuilder-agent-job-ledger/v2";
function hash(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
function dbPath(dataDir) { return path.join(path.resolve(dataDir), "agent-jobs.sqlite"); }
function legacyPath(dataDir) { return path.join(path.resolve(dataDir), "agent-jobs.json"); }
function json(value) { return JSON.stringify(value ?? null); }
function parsed(value, fallback = null) { try { return value == null ? fallback : JSON.parse(value); } catch { return fallback; } }

function open(dataDir) {
  if (!dataDir) throw new AppError("AGENT_JOB_DATA_DIR_REQUIRED", "DATA_DIR is required for persistent agent jobs.");
  fs.mkdirSync(path.resolve(dataDir), { recursive: true });
  const db = new DatabaseSync(dbPath(dataDir));
  db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS agent_jobs(
      job_id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      objective TEXT NOT NULL,
      access_token_hash TEXT NOT NULL,
      verdict TEXT,
      receipt_signed INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS agent_jobs_service_idx ON agent_jobs(service_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS agent_jobs_created_idx ON agent_jobs(created_at DESC);
  `);
  migrateLegacy(db, dataDir);
  return db;
}

function migrateLegacy(db, dataDir) {
  if (db.prepare("SELECT value FROM agent_meta WHERE key='legacy_json_migrated'").get()) return;
  const file = legacyPath(dataDir);
  if (fs.existsSync(file)) {
    const ledger = readJson(file, { schema: LEGACY_SCHEMA, jobs: {} });
    const insert = db.prepare(`INSERT OR IGNORE INTO agent_jobs(job_id,service_id,created_at,objective,access_token_hash,verdict,receipt_signed,payload_json) VALUES(?,?,?,?,?,?,?,?)`);
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const item of Object.values(ledger?.jobs ?? {})) {
        if (!item?.jobId || !item?.accessTokenHash) continue;
        const { accessTokenHash, ...safe } = item;
        insert.run(item.jobId, item.serviceId ?? "unknown", item.createdAt ?? new Date(0).toISOString(), String(item.objective ?? "").slice(0, 6000), accessTokenHash, item.verdict ?? null, item.receipt?.authenticity?.signature ? 1 : 0, json(safe));
      }
      db.prepare("INSERT OR REPLACE INTO agent_meta(key,value) VALUES('legacy_json_migrated',?)").run(new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  } else db.prepare("INSERT OR REPLACE INTO agent_meta(key,value) VALUES('legacy_json_migrated',?)").run(new Date().toISOString());
  db.prepare("INSERT OR REPLACE INTO agent_meta(key,value) VALUES('schema',?)").run(DB_SCHEMA);
}

function tokenMatches(stored, token) {
  if (!stored || !token) return false;
  const a = Buffer.from(stored, "hex"); const b = Buffer.from(hash(token), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function recordAgentJob(dataDir, { objective, result }) {
  if (!dataDir || !result?.receipt?.jobId) return null;
  const token = crypto.randomBytes(24).toString("base64url");
  const id = result.receipt.jobId;
  const job = {
    jobId: id,
    serviceId: result.service?.id ?? result.receipt.serviceId,
    createdAt: result.receipt.createdAt,
    objective: String(objective ?? "").slice(0, 6000),
    verdict: result.fulfillment?.verdict ?? null,
    agreement: result.agreement ?? null,
    fulfillment: result.fulfillment ?? null,
    receipt: result.receipt,
    text: String(result.text ?? "").slice(0, 50000),
    toolTrace: Array.isArray(result.toolTrace) ? result.toolTrace.slice(0, 200) : [],
    team: result.team ?? null,
    workflow: result.workflow ?? null,
    teamReports: Array.isArray(result.teamReports) ? result.teamReports.slice(0, 20) : undefined
  };
  const db = open(dataDir);
  try {
    db.prepare(`INSERT OR REPLACE INTO agent_jobs(job_id,service_id,created_at,objective,access_token_hash,verdict,receipt_signed,payload_json) VALUES(?,?,?,?,?,?,?,?)`)
      .run(id, job.serviceId ?? "unknown", job.createdAt ?? new Date().toISOString(), job.objective, hash(token), job.verdict, job.receipt?.authenticity?.signature ? 1 : 0, json(job));
  } finally { db.close(); }
  return { jobId: id, jobAccessToken: token };
}

export function getAgentJob(dataDir, jobId, token) {
  const db = open(dataDir);
  try {
    const row = db.prepare("SELECT access_token_hash,payload_json FROM agent_jobs WHERE job_id=?").get(String(jobId ?? ""));
    if (!row || !tokenMatches(row.access_token_hash, token)) throw new AppError("AGENT_JOB_NOT_FOUND", "Agent job not found or access token is invalid.");
    return parsed(row.payload_json, null);
  } finally { db.close(); }
}

export function serviceReputation(dataDir) {
  const db = open(dataDir);
  try {
    const rows = db.prepare("SELECT service_id,created_at,verdict,receipt_signed,payload_json FROM agent_jobs ORDER BY created_at DESC").all();
    const groups = new Map();
    for (const row of rows) {
      const job = parsed(row.payload_json, {}); const trace = Array.isArray(job.toolTrace) ? job.toolTrace : [];
      const g = groups.get(row.service_id) ?? { jobs:0, fulfilled:0, gaps:0, blocked:0, toolCalls:0, successfulToolCalls:0, signedReceipts:0, latestAt:null };
      g.jobs += 1;
      if (row.verdict === "fulfilled") g.fulfilled += 1; else if (row.verdict === "fulfilled-with-evidence-gaps") g.gaps += 1; else g.blocked += 1;
      g.toolCalls += trace.length; g.successfulToolCalls += trace.filter((x)=>x.status === "ok").length; g.signedReceipts += Number(row.receipt_signed) ? 1 : 0;
      if (!g.latestAt || row.created_at > g.latestAt) g.latestAt = row.created_at;
      groups.set(row.service_id, g);
    }
    return Object.fromEntries([...groups].map(([id,g])=>[id,{...g,
      evidenceSuccessRate:g.toolCalls?Number((g.successfulToolCalls/g.toolCalls).toFixed(3)):null,
      fulfillmentRate:g.jobs?Number((g.fulfilled/g.jobs).toFixed(3)):0,
      signedReceiptRate:g.jobs?Number((g.signedReceipts/g.jobs).toFixed(3)):0
    }]));
  } finally { db.close(); }
}

export function agentJobStoreInfo(dataDir) {
  const db = open(dataDir);
  try { return { schema: DB_SCHEMA, database: path.basename(dbPath(dataDir)), jobs: Number(db.prepare("SELECT COUNT(*) AS n FROM agent_jobs").get().n) }; }
  finally { db.close(); }
}
