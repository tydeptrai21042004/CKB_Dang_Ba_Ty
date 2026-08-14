import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { agentServiceCatalog, createAgentJobReceipt, createAgentServiceAgreement, createFiberPaymentQuote, evaluateAgentServiceFulfillment, runAgentService } from "../src/lib/agent-commerce-service.js";
import { aiProviderCatalog, callOptionalAi } from "../src/lib/ai-service.js";
import { resolveAgentTools } from "../src/lib/plugin-service.js";

function jsonResponse(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }); }
function openAiText(text) { return jsonResponse({ choices: [{ message: { content: text } }] }); }
function tmpRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), "ckbuilder-v8-")); }
function config(root = tmpRoot(), extra = {}) { return { ROOT_DIR: root, APP_NETWORK: "testnet", CKB_RPC_URL: "", FIBER_RPC_URL: "", CKB_AGENT_WORKSPACE: "", CKB_GITHUB_TOKEN: "", AI_DEFAULT_PROVIDER: "openai", AI_DEFAULT_MODEL: "gpt-4.1-mini", ...extra }; }

test("v8 service hub publishes multi-agent, Fiber commerce, service design, and verifiable research services", () => {
  const services = agentServiceCatalog(config(), process.cwd());
  for (const id of ["ckb-launch-readiness-team", "fiber-agent-commerce", "ckb-agent-service-designer", "ckb-verifiable-research"]) assert.ok(services.some((service) => service.id === id));
  const launch = services.find((service) => service.id === "ckb-launch-readiness-team");
  assert.equal(launch.kind, "team"); assert.equal(launch.roles.length, 3); assert.equal(launch.payment.autonomousSpend, false);
});

test("v8 automatically exposes a community MCP plugin as a delegatable service", () => {
  const root = tmpRoot(); const dir = path.join(root, "plugins", "community"); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "oracle.json"), JSON.stringify({ schemaVersion: 1, id: "ckb-oracle-lab", name: "CKB Oracle Lab", description: "Research oracle", source: "community", transport: "mcp", endpoint: "https://example.org/mcp", disabled: false }));
  const service = agentServiceCatalog(config(root), root).find((item) => item.id === "community-ckb-oracle-lab");
  assert.ok(service); assert.equal(service.kind, "community"); assert.equal(service.payment.autonomousSpend, false);
});


test("v8 service agreement fixes safety, step, payment, and evidence terms before execution", () => {
  const service = { id: "demo", outcome: "Evidence report", payment: { mode: "quote-only" }, evaluation: { minSuccessfulToolCalls: 1, anyEvidenceFrom: ["ckb-rpc"] } };
  const agreement = createAgentServiceAgreement({ service, objective: "inspect release", input: { maxSteps: 99 }, createdAt: "2026-08-14T00:00:00.000Z" });
  assert.match(agreement.agreementId, /^agr_[0-9a-f]{20}$/);
  assert.equal(agreement.executionTerms.maxSteps, 6); assert.equal(agreement.executionTerms.autonomousSpend, false); assert.equal(agreement.executionTerms.signingAuthority, false); assert.equal(agreement.executionTerms.broadcastAuthority, false);
  assert.deepEqual(agreement.evidencePolicy.anyEvidenceFrom, ["ckb-rpc"]);
});

test("v8 deterministic fulfillment evaluator distinguishes verified work from evidence gaps", () => {
  const service = { id: "demo", evaluation: { minSuccessfulToolCalls: 1, anyEvidenceFrom: ["ckb-rpc"] } };
  const agreement = createAgentServiceAgreement({ service: { ...service, outcome: "x", payment: { mode: "none" } }, objective: "x" });
  const good = evaluateAgentServiceFulfillment({ service, agreement, result: { text: "done", toolTrace: [{ pluginId: "ckb-rpc", tool: "get_tip", status: "ok" }] } });
  assert.equal(good.verdict, "fulfilled"); assert.deepEqual(good.matchedEvidence, ["ckb-rpc"]);
  const gap = evaluateAgentServiceFulfillment({ service, agreement, result: { text: "advisory only", toolTrace: [] } });
  assert.equal(gap.verdict, "fulfilled-with-evidence-gaps"); assert.deepEqual(gap.missingEvidence, ["ckb-rpc"]);
});
test("v8 Fiber quote forces dry_run=true and never sends a non-simulated payment", async () => {
  const seen = [];
  const result = await createFiberPaymentQuote({ targetPubkey: `02${"11".repeat(32)}`, amount: "0x64", maxFeeAmount: "0x05" }, config(tmpRoot(), { FIBER_RPC_URL: "http://127.0.0.1:8227" }), {
    toolFetchImpl: async (_url, options) => { const body = JSON.parse(options.body); seen.push(body); return jsonResponse({ jsonrpc: "2.0", id: 1, result: { status: "dry_run", fee: "0x02", route: ["A", "B"] } }); }
  });
  assert.equal(seen.length, 1); assert.equal(seen[0].method, "send_payment"); assert.equal(seen[0].params[0].dry_run, true); assert.equal(seen[0].params[0].keysend, true);
  assert.equal(result.intent.autonomousSpend, false); assert.equal(result.intent.requiresHumanExecution, true); assert.match(result.quoteHash, /^sha256:/);
});

test("v8 Fiber quote rejects malformed payment targets before calling FNN", async () => {
  let calls = 0;
  await assert.rejects(() => createFiberPaymentQuote({ targetPubkey: "bad", amount: "0x10" }, config(tmpRoot(), { FIBER_RPC_URL: "http://127.0.0.1:8227" }), { toolFetchImpl: async () => { calls += 1; return jsonResponse({}); } }), (error) => error.code === "FIBER_PAYMENT_QUOTE_INVALID");
  assert.equal(calls, 0);
});

test("v8 Fiber plugin exposes quote as a bounded read-risk tool but still blocks real payment tools", async () => {
  const methods = [];
  const runtime = await resolveAgentTools(["fiber-rpc"], { rootDir: tmpRoot(), fiberRpcUrl: "http://127.0.0.1:8227", fetchImpl: async (_url, options) => { const body = JSON.parse(options.body); methods.push(body); return jsonResponse({ jsonrpc: "2.0", id: 1, result: { ok: true } }); } });
  const quote = runtime.tools.find((tool) => tool.name.endsWith("fiber_payment_quote")); assert.ok(quote); assert.equal(quote.risk, "read");
  await runtime.execute(quote.name, { targetPubkey: `03${"22".repeat(32)}`, amount: "0x20" });
  assert.equal(methods[0].method, "send_payment"); assert.equal(methods[0].params[0].dry_run, true);
});

test("v8 job receipt binds objective, output, evidence, and an application-defined CKB anchor digest", () => {
  const receipt = createAgentJobReceipt({ service: { id: "demo" }, objective: "inspect tx", result: { text: "result", agent: "ckb-developer", provider: "openai", model: "m", steps: 2, toolTrace: [{ pluginId: "ckb-rpc", tool: "tip", status: "ok", risk: "read" }] }, createdAt: "2026-08-14T00:00:00.000Z", jobId: "job-1" });
  assert.match(receipt.receiptHash, /^sha256:[0-9a-f]{64}$/); assert.match(receipt.anchor.digestHex, /^0x[0-9a-f]{64}$/); assert.ok(receipt.anchor.suggestedCellDataHex.startsWith("0x434b424131")); assert.match(receipt.anchor.note, /not an official CKB protocol/i);
});

test("v8 single agent service returns a verifiable receipt", async () => {
  const root = tmpRoot(); let calls = 0;
  const result = await runAgentService({ "x-ai-api-key": "key", "x-ai-provider": "openai" }, { serviceId: "ckb-verifiable-research", objective: "Compare Fiber and on-chain payment architecture" }, config(root), { fetchImpl: async () => { calls += 1; return openAiText("Evidence-backed research result"); } });
  assert.equal(calls, 1); assert.equal(result.service.id, "ckb-verifiable-research"); assert.match(result.text, /Evidence-backed/); assert.match(result.agreement.agreementHash, /^sha256:/); assert.equal(result.fulfillment.verdict, "fulfilled-with-evidence-gaps"); assert.match(result.receipt.receiptHash, /^sha256:/); assert.equal(result.receipt.agreementHash, result.agreement.agreementHash);
});

test("v8 launch-readiness service coordinates three specialists then a release chair", async () => {
  const root = tmpRoot(); const responses = ["current ecosystem risk", "security review", "network readiness unknown", "CONDITIONAL GO: configure live endpoints and fix tests"]; let i = 0;
  const result = await runAgentService({ "x-ai-api-key": "key", "x-ai-provider": "openai" }, { serviceId: "ckb-launch-readiness-team", objective: "Ship my CKB dApp to testnet" }, config(root), { fetchImpl: async () => openAiText(responses[i++]) });
  assert.equal(i, 4); assert.equal(result.team.roles.length, 3); assert.equal(result.teamReports.length, 3); assert.match(result.text, /CONDITIONAL GO/); assert.match(result.receipt.receiptHash, /^sha256:/);
});

test("v8 NEAR AI Cloud is available as an explicit BYOK private/verifiable inference provider", async () => {
  assert.ok(aiProviderCatalog().some((provider) => provider.id === "nearai")); let seenUrl = "";
  const result = await callOptionalAi({ headers: { "x-ai-api-key": "near-key", "x-ai-provider": "nearai", "x-ai-model": "z-ai/glm-5.2" }, messages: [{ role: "user", content: "hello" }], fetchImpl: async (url) => { seenUrl = url; return openAiText("near ok"); } });
  assert.equal(seenUrl, "https://cloud-api.near.ai/v1/chat/completions"); assert.equal(result.provider, "nearai"); assert.equal(result.text, "near ok");
});
