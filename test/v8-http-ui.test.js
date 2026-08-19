import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createInspectorServer } from "../src/lib/inspector-http.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(repoRoot, "public", "index.html"), "utf8");
const app = fs.readFileSync(path.join(repoRoot, "public", "app.js"), "utf8");
function jsonResponse(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }); }
function openAiText(text) { return jsonResponse({ choices: [{ message: { content: text } }] }); }

async function withInspector(fn, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ckbuilder-v8http-")); const publicDir = path.join(root, "public"); fs.mkdirSync(publicDir, { recursive: true }); fs.writeFileSync(path.join(publicDir, "index.html"), "<title>v8</title>");
  const config = { ROOT_DIR: repoRoot, DATA_DIR: path.join(root, "data"), APP_NETWORK: "testnet", CKB_RPC_URL: "", FIBER_RPC_URL: "http://127.0.0.1:8227", CKB_AGENT_WORKSPACE: "", CKB_GITHUB_TOKEN: "SERVER_GITHUB_SECRET", PUBLIC_BASE_URL: "http://example.test", AI_ENABLED: true, AI_DEFAULT_PROVIDER: "openai", AI_DEFAULT_MODEL: "gpt-4.1-mini", PUBLIC_DIRECTORY_ENABLED: false };
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  const server = createInspectorServer({ config, publicDir, learningOverview: () => ({ summary: {} }), inspectCredential: async () => ({}), ...overrides }); server.listen(0, "127.0.0.1"); await once(server, "listening");
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise((resolve) => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); }
}

test("v8 config exposes agent services and NEAR AI without leaking server endpoints or tokens", async () => withInspector(async (base) => {
  const body = await (await fetch(`${base}/api/config`)).json(); assert.ok(body.agentServices.some((service) => service.id === "ckb-launch-readiness-team")); assert.ok(body.aiProviders.some((provider) => provider.id === "nearai"));
  const serialized = JSON.stringify(body); assert.equal(serialized.includes("SERVER_GITHUB_SECRET"), false); assert.equal(serialized.includes("127.0.0.1:8227"), false);
}));

test("v8 Fiber quote HTTP endpoint forces dry-run and returns human execution intent", async () => {
  const calls = [];
  await withInspector(async (base) => {
    const response = await fetch(`${base}/api/agent-commerce/fiber-quote`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetPubkey: `02${"33".repeat(32)}`, amount: "0x40" }) });
    assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.intent.dryRun, true); assert.equal(body.intent.requiresHumanExecution, true); assert.match(body.quoteHash, /^sha256:/);
  }, { toolFetchImpl: async (_url, options) => { const body = JSON.parse(options.body); calls.push(body); return jsonResponse({ jsonrpc: "2.0", id: 1, result: { fee: "0x01", status: "dry_run" } }); } });
  assert.equal(calls[0].method, "send_payment"); assert.equal(calls[0].params[0].dry_run, true);
});

test("v8 agent-commerce run endpoint returns cryptographic receipt", async () => withInspector(async (base) => {
  const response = await fetch(`${base}/api/agent-commerce/run`, { method: "POST", headers: { "content-type": "application/json", "x-ai-api-key": "key", "x-ai-provider": "openai" }, body: JSON.stringify({ serviceId: "ckb-verifiable-research", objective: "Research current CKB AI agent architecture" }) });
  assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.service.id, "ckb-verifiable-research"); assert.match(body.receipt.receiptHash, /^sha256:/); assert.match(body.text, /research complete/);
}, { aiFetchImpl: async () => openAiText("research complete") }));

test("v8 UI presents agent services before generic Mission Control and includes Fiber quote + receipt surfaces", () => {
  for (const id of ["agent-economy-hub", "agent-service-grid", "agent-service-form", "fiber-quote-form", "fiber-quote-output", "agent-service-receipt", "ckb-mission-control"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.ok(html.indexOf('id="agent-economy-hub"') < html.indexOf('id="ckb-mission-control"')); assert.match(html, /Run checkpointed CKB agent workflows with verifiable receipts/); assert.match(html, /dry_run=true/);
});

test("v8 browser calls agent-commerce APIs and renders delegation receipts", () => {
  assert.match(app, /function renderAgentServices\(\)/); assert.match(app, /postJson\("\/api\/agent-commerce\/fiber-quote"/); assert.match(app, /postJsonWithHeaders\("\/api\/agent-commerce\/run"/); assert.match(app, /result\.receipt/); assert.match(app, /latestFiberQuote/);
});
