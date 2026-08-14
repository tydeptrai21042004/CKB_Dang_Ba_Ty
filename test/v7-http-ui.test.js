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
function openAiTool(name, args = {}) { return jsonResponse({ choices: [{ message: { content: null, tool_calls: [{ id: "t1", type: "function", function: { name, arguments: JSON.stringify(args) } }] } }] }); }

async function withInspector(fn, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ckbuilder-v7http-")); const publicDir = path.join(root, "public"); fs.mkdirSync(publicDir, { recursive: true }); fs.writeFileSync(path.join(publicDir, "index.html"), "<title>v7</title>");
  const config = { ROOT_DIR: repoRoot, DATA_DIR: path.join(root, "data"), APP_NETWORK: "devnet", CKB_RPC_URL: "http://127.0.0.1:8114", FIBER_RPC_URL: "", CKB_AGENT_WORKSPACE: "", CKB_GITHUB_TOKEN: "SERVER_ONLY_TOKEN", PUBLIC_BASE_URL: "http://example.test", AI_ENABLED: true, AI_DEFAULT_PROVIDER: "openai", AI_DEFAULT_MODEL: "gpt-4.1-mini", PUBLIC_DIRECTORY_ENABLED: false };
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  const server = createInspectorServer({ config, publicDir, learningOverview: () => ({ summary: {} }), inspectCredential: async () => ({}), ...overrides }); server.listen(0, "127.0.0.1"); await once(server, "listening");
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise((resolve) => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); }
}

test("v7 config exposes mission readiness but never server-only connection secrets", async () => withInspector(async (base) => {
  const response = await fetch(`${base}/api/config`); const body = await response.json();
  assert.equal(body.ckbApplications.length, 7);
  assert.equal(body.ckbApplications.find((item) => item.id === "transaction-forensics").ready, true);
  assert.deepEqual(body.ckbApplications.find((item) => item.id === "fiber-operator-diagnostics").missingConfig, ["FIBER_RPC_URL"]);
  const serialized = JSON.stringify(body); assert.equal(serialized.includes("SERVER_ONLY_TOKEN"), false); assert.equal(serialized.includes("127.0.0.1:8114"), false);
}));

test("v7 health identifies Mission Control release", async () => withInspector(async (base) => {
  const body = await (await fetch(`${base}/api/health`)).json(); assert.equal(body.version, "8.0.0"); assert.equal(body.readOnly, true);
}));

test("v7 HTTP mission endpoint performs transaction evidence call then returns an audit trail", async () => {
  const txHash = `0x${"2".repeat(64)}`; let aiCalls = 0; const rpcMethods = [];
  await withInspector(async (base) => {
    const response = await fetch(`${base}/api/ai/application`, { method: "POST", headers: { "content-type": "application/json", "x-ai-api-key": "key", "x-ai-provider": "openai" }, body: JSON.stringify({ applicationId: "transaction-forensics", objective: `Inspect ${txHash}` }) });
    assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.application.id, "transaction-forensics"); assert.equal(body.toolTrace[0].pluginId, "ckb-rpc"); assert.match(body.text, /mission evidence/); assert.deepEqual(rpcMethods, ["get_transaction"]);
  }, {
    aiFetchImpl: async () => { aiCalls += 1; return aiCalls === 1 ? openAiTool("ckb-rpc__ckb_rpc_transaction", { txHash }) : openAiText("mission evidence synthesized"); },
    toolFetchImpl: async (_url, options) => { const request = JSON.parse(options.body); rpcMethods.push(request.method); return jsonResponse({ jsonrpc: "2.0", id: 1, result: { transaction: { hash: txHash }, tx_status: { status: "committed" } } }); }
  });
});

test("v7 UI makes real applications primary and keeps generic workbench secondary", () => {
  for (const id of ["ckb-mission-control", "ckb-application-grid", "ckb-application-form", "ckb-application-objective", "ckb-application-trace", "ai-agent-panel"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /Start with a CKB job, not an empty chatbot/); assert.match(html, /Advanced agent workbench/); assert.match(html, /Run CKB mission/);
});

test("v7 browser renders application cards and calls the dedicated workflow API", () => {
  assert.match(app, /function renderCkbApplications\(\)/); assert.match(app, /productConfig\.ckbApplications/); assert.match(app, /selectedCkbApplication\.id/); assert.match(app, /postJsonWithHeaders\("\/api\/ai\/application", payload/); assert.match(app, /Workflow evidence trail/);
});

test("v7 workflow endpoint rejects an empty objective before any model or tool call", async () => {
  let calls = 0;
  await withInspector(async (base) => {
    const response = await fetch(`${base}/api/ai/application`, { method: "POST", headers: { "content-type": "application/json", "x-ai-api-key": "key", "x-ai-provider": "openai" }, body: JSON.stringify({ applicationId: "research-brief", objective: "" }) });
    assert.equal(response.status, 400); const body = await response.json(); assert.equal(body.error, "CKB_APPLICATION_INPUT_REQUIRED");
  }, { aiFetchImpl: async () => { calls += 1; return openAiText("should not run"); }, toolFetchImpl: async () => { calls += 1; return jsonResponse({}); } });
  assert.equal(calls, 0);
});

test("v7 config publishes new plugin capabilities without connection endpoints or workspace paths", async () => withInspector(async (base) => {
  const body = await (await fetch(`${base}/api/config`)).json();
  for (const id of ["ckb-github", "fiber-rpc", "ckb-workspace"]) assert.ok(body.aiPlugins.some((plugin) => plugin.id === id));
  const serialized = JSON.stringify(body); assert.equal(serialized.includes("CKB_GITHUB_TOKEN"), false); assert.equal(serialized.includes(repoRoot), false);
}));
