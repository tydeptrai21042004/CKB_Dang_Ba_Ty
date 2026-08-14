import crypto from "node:crypto";
import path from "node:path";
import { AppError } from "./errors.js";
import { readJson, writeJsonAtomic } from "./json.js";

const SCHEMA = "ckbuilder-agent-job-ledger/v1";
const MAX_JOBS = 500;
function hash(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
function ledgerPath(dataDir) { return path.join(dataDir, "agent-jobs.json"); }
function load(dataDir) { return readJson(ledgerPath(dataDir), { schema: SCHEMA, jobs: {} }); }

export function recordAgentJob(dataDir, { objective, result }) {
  if (!dataDir || !result?.receipt?.jobId) return null;
  const token = crypto.randomBytes(24).toString("base64url");
  const ledger = load(dataDir); const id = result.receipt.jobId;
  ledger.jobs[id] = {
    jobId: id, serviceId: result.service?.id ?? result.receipt.serviceId, createdAt: result.receipt.createdAt,
    objective: String(objective ?? "").slice(0, 6000), accessTokenHash: hash(token),
    verdict: result.fulfillment?.verdict ?? null, agreement: result.agreement ?? null, fulfillment: result.fulfillment ?? null,
    receipt: result.receipt, text: String(result.text ?? "").slice(0, 50000), toolTrace: Array.isArray(result.toolTrace) ? result.toolTrace.slice(0, 100) : [],
    team: result.team ?? null, teamReports: Array.isArray(result.teamReports) ? result.teamReports.slice(0, 12) : undefined
  };
  const ordered = Object.values(ledger.jobs).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, MAX_JOBS);
  ledger.jobs = Object.fromEntries(ordered.map((job)=>[job.jobId, job])); writeJsonAtomic(ledgerPath(dataDir), ledger);
  return { jobId: id, jobAccessToken: token };
}

export function getAgentJob(dataDir, jobId, token) {
  const job = load(dataDir).jobs[String(jobId ?? "")];
  if (!job || !token || hash(token) !== job.accessTokenHash) throw new AppError("AGENT_JOB_NOT_FOUND", "Agent job not found or access token is invalid.");
  const { accessTokenHash, ...safe } = job; return safe;
}

export function serviceReputation(dataDir) {
  const jobs = Object.values(load(dataDir).jobs); const groups = new Map();
  for (const job of jobs) { const g = groups.get(job.serviceId) ?? { jobs:0, fulfilled:0, gaps:0, blocked:0, toolCalls:0, successfulToolCalls:0, latestAt:null };
    g.jobs += 1; if (job.verdict === "fulfilled") g.fulfilled += 1; else if (job.verdict === "fulfilled-with-evidence-gaps") g.gaps += 1; else g.blocked += 1;
    g.toolCalls += job.toolTrace.length; g.successfulToolCalls += job.toolTrace.filter((x)=>x.status==="ok").length; if (!g.latestAt || job.createdAt > g.latestAt) g.latestAt = job.createdAt; groups.set(job.serviceId,g); }
  return Object.fromEntries([...groups].map(([id,g])=>[id,{...g, evidenceSuccessRate:g.toolCalls?Number((g.successfulToolCalls/g.toolCalls).toFixed(3)):null, fulfillmentRate:g.jobs?Number((g.fulfilled/g.jobs).toFixed(3)):0}]));
}
