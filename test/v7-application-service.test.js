import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ckbApplicationCatalog, getCkbApplication, prepareCkbApplicationRun, runCkbApplication } from "../src/lib/application-service.js";

function jsonResponse(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }); }
function openAiText(text) { return jsonResponse({ choices: [{ message: { content: text } }] }); }
function openAiTool(name, args = {}) { return jsonResponse({ choices: [{ message: { content: null, tool_calls: [{ id: "t1", type: "function", function: { name, arguments: JSON.stringify(args) } }] } }] }); }
function config(extra = {}) { return { ROOT_DIR: process.cwd(), APP_NETWORK: "devnet", CKB_RPC_URL: "http://127.0.0.1:8114", AI_DEFAULT_PROVIDER: "openai", AI_DEFAULT_MODEL: "gpt-4.1-mini", ...extra }; }

test("v7 publishes concrete CKB missions with readiness and deliverables", () => {
  const apps = ckbApplicationCatalog(config());
  assert.equal(apps.length, 7);
  for (const id of ["fiber-operator-diagnostics", "transaction-forensics", "script-debug-lab", "asset-provenance", "contribution-finder", "research-brief", "dapp-architecture"]) assert.ok(apps.some((app) => app.id === id));
  assert.equal(apps.find((app) => app.id === "transaction-forensics").ready, true);
  assert.deepEqual(apps.find((app) => app.id === "fiber-operator-diagnostics").missingConfig, ["FIBER_RPC_URL"]);
  assert.ok(apps.every((app) => app.deliverables.length >= 5));
});

test("v7 transaction mission deterministically selects the specialist, plugins, and output contract", () => {
  const prepared = prepareCkbApplicationRun({ applicationId: "transaction-forensics", objective: "Find why transaction 0xabc fails", context: { txHash: "0xabc" } }, config());
  assert.equal(prepared.agentInput.agent, "ckb-transaction-reviewer");
  assert.deepEqual(prepared.agentInput.plugins, ["ckb-rpc", "ckb-docs"]);
  assert.match(prepared.agentInput.task, /REQUIRED DELIVERABLES/);
  assert.match(prepared.agentInput.task, /root-cause ranking/);
  assert.equal(prepared.agentInput.maxSteps, 6);
});

test("v7 mission input validation rejects unknown workflows and empty objectives", () => {
  assert.throws(() => getCkbApplication("not-real"), (error) => error.code === "CKB_APPLICATION_NOT_FOUND");
  assert.throws(() => prepareCkbApplicationRun({ applicationId: "research-brief", objective: "" }, config()), (error) => error.code === "CKB_APPLICATION_INPUT_REQUIRED");
});

test("v7 transaction mission runs end-to-end through live RPC evidence then synthesis", async () => {
  const txHash = `0x${"1".repeat(64)}`;
  let aiCalls = 0; const rpcMethods = [];
  const result = await runCkbApplication({ "x-ai-api-key": "key", "x-ai-provider": "openai" }, {
    applicationId: "transaction-forensics", objective: `Inspect ${txHash}`
  }, config(), {
    rootDir: fs.mkdtempSync(path.join(os.tmpdir(), "ckbuilder-v7app-")),
    fetchImpl: async () => { aiCalls += 1; return aiCalls === 1 ? openAiTool("ckb-rpc__ckb_rpc_transaction", { txHash }) : openAiText("Observed transaction evidence was retrieved. The remaining root cause requires a dry-run or raw transaction context."); },
    toolFetchImpl: async (_url, options) => { const body = JSON.parse(options.body); rpcMethods.push(body.method); return jsonResponse({ jsonrpc: "2.0", id: 1, result: { transaction: { hash: txHash }, tx_status: { status: "committed" } } }); }
  });
  assert.equal(result.application.id, "transaction-forensics");
  assert.equal(result.agent, "ckb-transaction-reviewer");
  assert.deepEqual(rpcMethods, ["get_transaction"]);
  assert.equal(result.toolTrace[0].pluginId, "ckb-rpc");
  assert.match(result.text, /Observed transaction evidence/);
});

test("v7 mission step budgets are clamped to a useful multi-step range", () => {
  assert.equal(prepareCkbApplicationRun({ applicationId: "research-brief", objective: "research Fiber", maxSteps: 1 }, config()).agentInput.maxSteps, 2);
  assert.equal(prepareCkbApplicationRun({ applicationId: "research-brief", objective: "research Fiber", maxSteps: 99 }, config()).agentInput.maxSteps, 6);
});

test("v7 research and contribution missions work without privileged local configuration", () => {
  const apps = ckbApplicationCatalog({ APP_NETWORK: "devnet" });
  assert.equal(apps.find((app) => app.id === "research-brief").ready, true);
  assert.equal(apps.find((app) => app.id === "contribution-finder").ready, true);
  assert.equal(apps.find((app) => app.id === "script-debug-lab").ready, false);
});
