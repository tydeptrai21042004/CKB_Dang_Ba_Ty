import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { agentServiceCatalog, runAgentService } from "../src/lib/agent-commerce-service.js";
import { buildAgentWorkflowPlan, createAgentWorkflowCheckpoint, evaluateAgentWorkflow, verifyAgentWorkflowCheckpoint } from "../src/lib/agent-workflow-service.js";

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), "ckbuilder-workflow-")); }
function openAiText(text) { return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200, headers: { "content-type": "application/json" } }); }

const service = {
  id: "test-service",
  kind: "single",
  workflow: ["Scope", "Collect evidence", "Review", "Synthesize"],
  evaluation: { minSuccessfulToolCalls: 1, anyEvidenceFrom: ["ckb-docs", "ckb-rpc"] }
};

test("v10.2 workflow planner creates dependency-aware stages and human approval gates", () => {
  const plan = buildAgentWorkflowPlan({ service, objective: "Review a CKB Testnet launch" });
  assert.equal(plan.schema, "ckbuilder-agent-workflow-plan/v1");
  assert.equal(plan.nodes.length, 4);
  assert.deepEqual(plan.nodes[0].dependsOn, []);
  assert.deepEqual(plan.nodes[1].dependsOn, ["stage-1"]);
  assert.equal(plan.executionPolicy.signingAuthority, false);
  assert.equal(plan.executionPolicy.broadcastAuthority, false);
  assert.equal(plan.approvalGates.length, 3);
  assert.match(plan.planHash, /^sha256:[0-9a-f]{64}$/);
});

test("v10.2 workflow evaluation scores evidence and creates an independently verifiable checkpoint", () => {
  const plan = buildAgentWorkflowPlan({ service, objective: "Review a CKB Testnet launch" });
  const result = { text: "Evidence-backed result", toolTrace: [{ tool: "ckb_docs", pluginId: "ckb-docs", status: "ok", risk: "read" }] };
  const evaluation = evaluateAgentWorkflow({ plan, result, fulfillment: { verdict: "fulfilled" } });
  assert.equal(evaluation.state, "completed");
  assert.equal(evaluation.confidence.level, "high");
  assert.equal(evaluation.evidence.matchedSources.includes("ckb-docs"), true);
  const checkpoint = createAgentWorkflowCheckpoint({ plan, evaluation, result });
  assert.equal(verifyAgentWorkflowCheckpoint(checkpoint).valid, true);
  assert.equal(verifyAgentWorkflowCheckpoint({ ...checkpoint, state: "tampered" }).valid, false);
});

test("v10.2 catalog adds the checkpointed CKB Agent Workflow Orchestrator", () => {
  const catalog = agentServiceCatalog({}, process.cwd());
  const orchestrator = catalog.find((item) => item.id === "ckb-agent-workflow-orchestrator");
  assert.ok(orchestrator);
  assert.equal(orchestrator.kind, "team");
  assert.equal(orchestrator.roles.length, 3);
  assert.equal(orchestrator.payment.autonomousSpend, false);
  assert.ok(orchestrator.workflow.length >= 5);
});

test("v10.2 completed agent service returns plan, evidence control, checkpoint, and receipt bindings", async () => {
  const data = tmp();
  try {
    const result = await runAgentService(
      { "x-ai-api-key": "test-key", "x-ai-provider": "openai" },
      { serviceId: "ckb-verifiable-research", objective: "Summarize the supplied CKB architecture facts without inventing chain state." },
      { ROOT_DIR: process.cwd(), DATA_DIR: data, APP_NETWORK: "testnet", CKB_RPC_URL: "", FIBER_RPC_URL: "", CKB_AGENT_WORKSPACE: "", CKB_GITHUB_TOKEN: "", AI_DEFAULT_PROVIDER: "openai", AI_DEFAULT_MODEL: "test-model" },
      { fetchImpl: async () => openAiText("Completed review with explicit evidence boundaries.") }
    );
    assert.equal(result.workflowPlan.schema, "ckbuilder-agent-workflow-plan/v1");
    assert.equal(result.workflowControl.schema, "ckbuilder-agent-workflow-evaluation/v1");
    assert.equal(result.workflowCheckpoint.schema, "ckbuilder-agent-workflow-checkpoint/v1");
    assert.equal(verifyAgentWorkflowCheckpoint(result.workflowCheckpoint).valid, true);
    assert.equal(result.receipt.workflowPlanHash, result.workflowPlan.planHash);
    assert.equal(result.receipt.workflowControlHash, result.workflowControl.evaluationHash);
    assert.equal(result.receipt.workflowCheckpointHash, result.workflowCheckpoint.checkpointHash);
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
});
