import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";
import { ckbApplicationCatalog, prepareCkbApplicationRun, runCkbApplication } from "../src/lib/application-service.js";
import { agentServiceCatalog, runAgentService, verifyAgentJobReceipt } from "../src/lib/agent-commerce-service.js";
import { createInspectorServer } from "../src/lib/inspector-http.js";

function jsonResponse(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }); }
function openAiText(text) { return jsonResponse({ choices: [{ message: { content: text } }] }); }
function openAiTool(name, args = {}) { return jsonResponse({ choices: [{ message: { content: null, tool_calls: [{ id: "t1", type: "function", function: { name, arguments: JSON.stringify(args) } }] } }] }); }
function tempRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), "ckbuilder-expanded-")); }
function config(extra = {}) { return { ROOT_DIR: process.cwd(), DATA_DIR: tempRoot(), APP_NETWORK: "testnet", CKB_RPC_URL: "", FIBER_RPC_URL: "", CKB_AGENT_WORKSPACE: "", CKB_GITHUB_TOKEN: "", PUBLIC_BASE_URL: "http://example.test", AI_ENABLED: true, AI_DEFAULT_PROVIDER: "openai", AI_DEFAULT_MODEL: "m", PUBLIC_DIRECTORY_ENABLED: false, ...extra }; }

const NEW_APPLICATIONS = [
  "testnet-launch-gate", "ccc-wallet-integration", "xudt-token-launch", "spore-dob-launch",
  "rgbpp-integration-review", "credential-trust-audit", "rpc-incident-response", "fiber-liquidity-planning"
];
const NEW_SERVICES = ["ckb-production-incident-team", "ckb-credential-trust-auditor", "ckb-wallet-flow-reviewer", "ckb-asset-launch-reviewer"];

test("expanded Mission Control publishes fifteen concrete use cases with ordered workflow stages", () => {
  const apps = ckbApplicationCatalog(config());
  assert.equal(apps.length, 15);
  for (const id of NEW_APPLICATIONS) assert.ok(apps.some((app) => app.id === id), `missing ${id}`);
  for (const app of apps) {
    assert.ok(app.deliverables.length >= 5, `${app.id} needs five deliverables`);
    assert.ok(app.workflow.length >= 4, `${app.id} needs a multi-stage workflow`);
    assert.deepEqual(app.workflow.map((stage) => stage.order), app.workflow.map((_, index) => index + 1));
    assert.equal(new Set(app.workflow.map((stage) => stage.id)).size, app.workflow.length);
  }
});

test("expanded workflows report live-evidence requirements without requiring secrets", () => {
  const apps = ckbApplicationCatalog({ APP_NETWORK: "testnet" });
  assert.deepEqual(apps.find((app) => app.id === "testnet-launch-gate").missingConfig, ["CKB_RPC_URL"]);
  assert.deepEqual(apps.find((app) => app.id === "rpc-incident-response").missingConfig, ["CKB_RPC_URL"]);
  assert.deepEqual(apps.find((app) => app.id === "fiber-liquidity-planning").missingConfig, ["FIBER_RPC_URL"]);
  for (const id of ["ccc-wallet-integration", "xudt-token-launch", "spore-dob-launch", "rgbpp-integration-review", "credential-trust-audit"]) assert.equal(apps.find((app) => app.id === id).ready, true);
  const serialized = JSON.stringify(apps);
  for (const forbidden of ["PRIVATE_KEY", "SEED", "MNEMONIC", "ADMIN_PASSWORD", "SESSION_SECRET"]) assert.equal(serialized.includes(forbidden), false);
});

test("workflow preparation binds ordered stages and deliverables into the agent contract", () => {
  const prepared = prepareCkbApplicationRun({ applicationId: "ccc-wallet-integration", objective: "Review connect, sign, submit, and retry boundaries" }, config());
  assert.equal(prepared.application.workflow.length, 5);
  assert.match(prepared.agentInput.task, /WORKFLOW STAGES/);
  assert.match(prepared.agentInput.task, /Verify explicit signing and user confirmation boundary/);
  assert.match(prepared.agentInput.task, /minimal integration test matrix/);
  assert.deepEqual(prepared.agentInput.plugins, ["ckb-docs", "ckb-workspace"]);
});

test("xUDT launch workflow can execute a grounded docs step and synthesize a result", async () => {
  let aiCalls = 0; let docsCalls = 0;
  const result = await runCkbApplication({ "x-ai-api-key": "key", "x-ai-provider": "openai" }, { applicationId: "xudt-token-launch", objective: "Plan a safe Testnet xUDT launch" }, config(), {
    fetchImpl: async () => (++aiCalls === 1 ? openAiTool("ckb-docs__ckb_dev_skills", { query: "xUDT Cell Type Script testing" }) : openAiText("xUDT launch plan grounded in current CKB development guidance.")),
    toolFetchImpl: async () => { docsCalls += 1; return new Response("CKB Dev Skills xUDT Cell Type Script transaction testing deployment", { status: 200 }); }
  });
  assert.equal(aiCalls, 2); assert.equal(docsCalls, 1);
  assert.equal(result.application.id, "xudt-token-launch");
  assert.equal(result.toolTrace[0].pluginId, "ckb-docs");
  assert.match(result.text, /xUDT launch plan/);
});

test("RPC incident workflow gathers only read-only tip evidence", async () => {
  let aiCalls = 0; const rpcMethods = [];
  const result = await runCkbApplication({ "x-ai-api-key": "key", "x-ai-provider": "openai" }, { applicationId: "rpc-incident-response", objective: "Triage stale RPC data" }, config({ CKB_RPC_URL: "http://127.0.0.1:8114" }), {
    fetchImpl: async () => (++aiCalls === 1 ? openAiTool("ckb-rpc__ckb_rpc_tip", {}) : openAiText("Incident remains contained; compare repeated tip observations before declaring recovery.")),
    toolFetchImpl: async (_url, options) => { const body = JSON.parse(options.body); rpcMethods.push(body.method); return jsonResponse({ jsonrpc: "2.0", id: 1, result: body.method === "get_tip_block_number" ? "0x123" : { number: "0x123" } }); }
  });
  assert.deepEqual(rpcMethods, ["get_tip_block_number", "get_tip_header"]);
  assert.equal(result.application.ready, true);
  assert.equal(result.toolTrace[0].pluginId, "ckb-rpc");
  assert.ok(!rpcMethods.includes("send_transaction"));
});

test("Fiber liquidity workflow uses a read-only operator snapshot and never mutates channels or payments", async () => {
  let aiCalls = 0; const methods = [];
  const result = await runCkbApplication({ "x-ai-api-key": "key", "x-ai-provider": "openai" }, { applicationId: "fiber-liquidity-planning", objective: "Find why larger payments fail" }, config({ FIBER_RPC_URL: "http://127.0.0.1:8227" }), {
    fetchImpl: async () => (++aiCalls === 1 ? openAiTool("fiber-rpc__fiber_health_snapshot", {}) : openAiText("Liquidity plan: validate channel capacity and route availability before any human-approved changes.")),
    toolFetchImpl: async (_url, options) => { const body = JSON.parse(options.body); methods.push(body.method); return jsonResponse({ jsonrpc: "2.0", id: 1, result: body.method === "node_info" ? { node_name: "test" } : [] }); }
  });
  assert.equal(result.application.id, "fiber-liquidity-planning");
  assert.ok(methods.length >= 3);
  for (const forbidden of ["open_channel", "shutdown_channel", "send_payment"]) assert.equal(methods.includes(forbidden), false);
});

test("Agent Service Hub exposes four additional real-world services with bounded workflows", () => {
  const services = agentServiceCatalog(config(), process.cwd());
  for (const id of NEW_SERVICES) assert.ok(services.some((service) => service.id === id), `missing ${id}`);
  for (const service of services.filter((item) => NEW_SERVICES.includes(item.id))) {
    assert.ok(service.workflow.length >= 5);
    assert.equal(service.payment.autonomousSpend, false);
  }
  const incident = services.find((service) => service.id === "ckb-production-incident-team");
  assert.equal(incident.kind, "team"); assert.equal(incident.roles.length, 3); assert.deepEqual(incident.missingConfig, ["CKB_RPC_URL"]);
});

test("wallet-flow review service runs without signing authority and returns a verifiable signed receipt", async () => {
  const data = tempRoot();
  const result = await runAgentService({ "x-ai-api-key": "key", "x-ai-provider": "openai" }, { serviceId: "ckb-wallet-flow-reviewer", objective: "Review wallet connect/sign/submit flow" }, config({ DATA_DIR: data }), { fetchImpl: async () => openAiText("Wallet flow reviewed; signing remains a human wallet boundary.") });
  assert.equal(result.service.id, "ckb-wallet-flow-reviewer");
  assert.equal(result.agreement.executionTerms.signingAuthority, false);
  assert.equal(result.agreement.executionTerms.broadcastAuthority, false);
  assert.match(result.receipt.workflowHash, /^sha256:/);
  assert.equal(verifyAgentJobReceipt(result.receipt).valid, true);
});

test("production incident team runs three specialists plus incident-command synthesis", async () => {
  const requests = []; const outputs = ["rpc evidence", "transaction impact", "trust analysis", "SEV-2: contain, verify node/indexer recovery, then reopen traffic"];
  let i = 0;
  const result = await runAgentService({ "x-ai-api-key": "key", "x-ai-provider": "openai" }, { serviceId: "ckb-production-incident-team", objective: "Investigate stale Cell reads" }, config({ CKB_RPC_URL: "http://127.0.0.1:8114" }), {
    fetchImpl: async (_url, options) => { requests.push(JSON.parse(options.body)); return openAiText(outputs[i++]); }
  });
  assert.equal(i, 4); assert.equal(result.teamReports.length, 3); assert.equal(result.workflow.nodes.length, 4);
  const finalPayload = JSON.stringify(requests.at(-1));
  assert.match(finalPayload, /incident commander/i);
  assert.match(result.text, /SEV-2/);
  assert.equal(result.receipt.authenticity.mode, "ed25519");
});

test("public config and browser expose workflow stages without leaking runtime connection values", async () => {
  const root = tempRoot(); const publicDir = path.join(root, "public"); fs.mkdirSync(publicDir, { recursive: true }); fs.writeFileSync(path.join(publicDir, "index.html"), "x");
  const cfg = config({ ROOT_DIR: process.cwd(), DATA_DIR: path.join(root, "data"), CKB_RPC_URL: "http://127.0.0.1:8114", FIBER_RPC_URL: "http://127.0.0.1:8227", CKB_GITHUB_TOKEN: "SECRET_TOKEN" }); fs.mkdirSync(cfg.DATA_DIR, { recursive: true });
  const server = createInspectorServer({ config: cfg, publicDir, learningOverview: () => ({ summary: {} }), inspectCredential: async () => ({}) }); server.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const body = await (await fetch(`http://127.0.0.1:${server.address().port}/api/config`)).json();
    assert.equal(body.ckbApplications.length, 15);
    assert.ok(body.ckbApplications.find((item) => item.id === "credential-trust-audit").workflow.length >= 4);
    assert.ok(body.agentServices.some((item) => item.id === "ckb-asset-launch-reviewer"));
    const text = JSON.stringify(body); assert.equal(text.includes("127.0.0.1:8114"), false); assert.equal(text.includes("SECRET_TOKEN"), false);
  } finally { await new Promise((resolve) => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); }

  const browser = fs.readFileSync(path.join(process.cwd(), "public", "app.js"), "utf8");
  const html = fs.readFileSync(path.join(process.cwd(), "public", "index.html"), "utf8");
  assert.match(browser, /application-workflow/); assert.match(browser, /stage\.title/); assert.match(browser, /Stages:/);
  assert.match(html, /id="ckb-application-filter"/); assert.match(browser, /ckb-application-filter/); assert.match(browser, /No workflows match this filter/);
});

test("all expanded workflows preserve non-custodial safety boundaries", () => {
  const apps = ckbApplicationCatalog(config({ CKB_RPC_URL: "http://rpc", FIBER_RPC_URL: "http://fiber" }));
  for (const app of apps.filter((item) => NEW_APPLICATIONS.includes(item.id))) {
    assert.ok(!app.requires.some((key) => /PRIVATE|SEED|MNEMONIC|SIGNING/i.test(key)));
  }
  const services = agentServiceCatalog(config(), process.cwd());
  for (const service of services.filter((item) => NEW_SERVICES.includes(item.id))) {
    assert.equal(service.payment.autonomousSpend, false);
    assert.ok(!service.missingConfig.some((key) => /PRIVATE|SEED|MNEMONIC|SIGNING/i.test(key)));
  }
});
