#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "vercel.json",
  "vercel-entry.js",
  ".vercelignore",
  "public/index.html",
  "public/app.js",
  "public/styles.css",
  "data/ledger.json",
  "data/trusted-issuers.json",
  "data/offckb-chain-state.json",
  "deployment/scripts.json",
  "deployment/system-scripts.json"
];

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}
function pass(message) { console.log(`PASS: ${message}`); }
function warn(message) { console.warn(`WARN: ${message}`); }
function readJson(relative) { return JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8")); }

for (const relative of required) {
  if (!fs.existsSync(path.join(ROOT, relative))) fail(`Missing ${relative}`);
}
if (process.exitCode) process.exit(process.exitCode);
pass("Required Vercel/public runtime files are present.");

for (const relative of ["vercel.json", "package.json", "package-lock.json", "data/ledger.json", "data/trusted-issuers.json", "deployment/scripts.json", "deployment/system-scripts.json"]) {
  try { readJson(relative); } catch (error) { fail(`${relative} is not valid JSON: ${error.message}`); }
}
if (process.exitCode) process.exit(process.exitCode);
pass("Deployment JSON files parse successfully.");

const pkg = readJson("package.json");
if (pkg.engines?.node !== "22.x") fail(`package.json must pin engines.node to 22.x for the validated Vercel runtime (found ${pkg.engines?.node ?? "missing"}).`);
else pass("Node runtime is pinned to 22.x.");

const vercel = readJson("vercel.json");
const serializedVercel = JSON.stringify(vercel);
for (const requiredBundlePath of ["data/ledger.json", "data/trusted-issuers.json", "deployment/*.json", "public/**"]) {
  if (!serializedVercel.includes(requiredBundlePath)) fail(`vercel.json does not bundle ${requiredBundlePath}`);
}
if (process.exitCode) process.exit(process.exitCode);
pass("vercel.json includes the public runtime assets needed by the existing server.");

const forbiddenPatterns = [
  /^\.env$/,
  /^secrets(?:\/|$)/,
  /(?:^|\/)agent-jobs\.sqlite$/,
  /(?:^|\/)ckbuilder-passport\.sqlite$/,
  /(?:^|\/)private(?:\/|$)/
];
function walk(dir, base = "") {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}
const projectFiles = walk(ROOT);
const forbidden = projectFiles.filter((relative) => forbiddenPatterns.some((pattern) => pattern.test(relative)));
if (forbidden.length) fail(`Private/runtime files are present in the deployable tree: ${forbidden.slice(0, 10).join(", ")}`);
else pass("No real .env, secrets, private agent state, or runtime SQLite database is present.");

const deployments = readJson("deployment/scripts.json");
const network = process.env.APP_NETWORK || "testnet";
const chainContract = deployments?.[network]?.["credential-revocation"];
if (!chainContract?.codeHash) warn(`${network} credential-revocation deployment metadata is not present; Vercel will intentionally run off-chain verification with chainInspectionEnabled=false until you add it.`);
else pass(`${network} chain deployment metadata is present.`);

// Exercise the actual root-level Vercel adapter without requiring the Vercel CLI.
process.env.VERCEL = "1";
process.env.VERCEL_URL = process.env.VERCEL_URL || "ckbuilder-check.vercel.app";
process.env.VERCEL_PROJECT_PRODUCTION_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL || "ckbuilder-check.vercel.app";
const { default: handler } = await import(`../vercel-entry.js?deploy-check=${Date.now()}`);
const server = http.createServer(handler);
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
const base = `http://127.0.0.1:${address.port}`;

async function json(pathname, options) {
  const response = await fetch(`${base}${pathname}`, options);
  let body = null;
  try { body = await response.json(); } catch {}
  return { response, body };
}

try {
  const health = await json("/api/health");
  if (health.response.status !== 200 || health.body?.ok !== true) fail(`/api/health failed (${health.response.status}).`);
  else pass("Vercel adapter /api/health returns HTTP 200.");

  const ready = await json("/api/ready");
  if (ready.response.status !== 200 || ready.body?.ok !== true || ready.body?.deploymentTarget !== "vercel") fail(`/api/ready is not Vercel-ready: ${JSON.stringify(ready.body)}`);
  else pass("Vercel adapter /api/ready confirms the bundled public ledger.");

  const config = await json("/api/config");
  const expected = config.body && config.body.submissionEnabled === false && config.body.qrEnabled === false && config.body.agentJobStoreEnabled === false && config.body.storageMode === "read-only" && config.body.deploymentTarget === "vercel";
  if (config.response.status !== 200 || !expected) fail(`/api/config exposes an unsafe/incorrect serverless capability set: ${JSON.stringify(config.body)}`);
  else pass("Serverless capability flags correctly disable persistent submissions, QR binary use, and local agent-job storage.");

  const ledger = readJson("data/ledger.json");
  const credentialId = Object.keys(ledger.credentials ?? {})[0];
  if (credentialId) {
    const inspect = await json("/api/inspect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credentialId })
    });
    if (inspect.response.status !== 200 || !inspect.body?.offChain?.integrityValid) fail(`/api/inspect serverless smoke test failed: HTTP ${inspect.response.status}`);
    else pass("Public credential inspection works through the Vercel adapter without a private key or SQLite database.");
  }

  const qr = await json(`/api/qr?credentialId=${encodeURIComponent(credentialId ?? "demo")}`);
  if (qr.response.status >= 500) fail("Disabled QR route produced a server error instead of a controlled response.");
  else pass("QR capability degrades gracefully when qrencode is unavailable on Vercel.");

  const job = await json("/api/agent-commerce/jobs/not-a-job?token=not-a-token");
  if (job.response.status >= 500) fail("Disabled agent-job persistence produced a server error instead of a controlled response.");
  else pass("Persistent agent-job lookup degrades gracefully on serverless storage.");
} finally {
  await new Promise((resolve) => server.close(resolve));
}

for (const relative of ["data/agent-jobs.sqlite", "data/ckbuilder-passport.sqlite", "data/private/agent-service-identity.json"]) {
  if (fs.existsSync(path.join(ROOT, relative))) fail(`Vercel smoke test unexpectedly wrote ${relative}`);
}
if (!process.exitCode) {
  pass("Vercel smoke test left bundled data read-only.");
  console.log("\nVercel deployment preflight PASSED.");
}
process.exit(process.exitCode ?? 0);
