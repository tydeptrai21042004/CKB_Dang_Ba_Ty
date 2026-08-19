import crypto from "node:crypto";
import { AppError } from "./errors.js";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function boundedText(value, label, max = 6000) {
  const text = String(value ?? "").trim();
  if (!text) throw new AppError("AGENT_WORKFLOW_INPUT_REQUIRED", `${label} is required.`);
  if (text.length > max) throw new AppError("AGENT_WORKFLOW_INPUT_TOO_LONG", `${label} must be at most ${max} characters.`);
  return text;
}

function workflowStages(service = {}) {
  const stages = Array.isArray(service.workflow) && service.workflow.length
    ? service.workflow
    : ["Scope objective", "Collect allowed evidence", "Analyze evidence and gaps", "Produce reviewable output"];
  return stages.map((title, index) => ({
    id: `stage-${index + 1}`,
    order: index + 1,
    title: String(title),
    type: index === 0 ? "planning" : index === stages.length - 1 ? "synthesis" : "analysis",
    dependsOn: index === 0 ? [] : [`stage-${index}`]
  }));
}

export function buildAgentWorkflowPlan({ service, objective, agreement = null, createdAt = new Date().toISOString() }) {
  if (!service || typeof service !== "object" || !String(service.id ?? "").trim()) {
    throw new AppError("AGENT_WORKFLOW_SERVICE_INVALID", "A valid agent service is required to build a workflow plan.");
  }
  const normalizedObjective = boundedText(objective, "objective");
  const nodes = workflowStages(service);
  const evidencePolicy = agreement?.evidencePolicy ?? service.evaluation ?? { minSuccessfulToolCalls: 0, anyEvidenceFrom: [] };
  const core = {
    schema: "ckbuilder-agent-workflow-plan/v1",
    serviceId: service.id,
    createdAt,
    objectiveHash: `sha256:${digest(normalizedObjective)}`,
    mode: service.kind === "team" ? "parallel-specialists-with-gates" : "sequential-evidence-workflow",
    nodes,
    evidencePolicy: {
      minSuccessfulToolCalls: Math.max(0, Number(evidencePolicy.minSuccessfulToolCalls) || 0),
      anyEvidenceFrom: [...new Set(evidencePolicy.anyEvidenceFrom ?? [])].sort()
    },
    executionPolicy: {
      readOnlyFirst: true,
      maxAgentSteps: Math.max(1, Math.min(6, Number(agreement?.executionTerms?.maxSteps) || 5)),
      autonomousSpend: false,
      signingAuthority: false,
      broadcastAuthority: false,
      exactArgumentApprovalForNonReadOnlyTools: true
    },
    approvalGates: [
      { id: "non-read-only-tool", trigger: "plugin tool is not explicitly read-only", authority: "human", scope: "exact tool + arguments hash" },
      { id: "wallet-signing", trigger: "transaction requires a signature", authority: "external wallet/user", scope: "never delegated to AI runtime" },
      { id: "fund-spend", trigger: "real CKB/Fiber value transfer", authority: "external wallet/user", scope: "quote/intent only inside CKBuilder" }
    ],
    recoveryPolicy: {
      toolFailure: "continue with available evidence, preserve the failed tool in the audit trace, and name the missing fact",
      evidenceGap: "return a conditional result and the smallest next verification step",
      approvalRequired: "checkpoint the workflow and wait for exact-argument human approval",
      stepLimit: "stop without inventing completion and return the remaining evidence gap"
    }
  };
  const planHash = `sha256:${digest(core)}`;
  return { ...core, planHash };
}

export function evaluateAgentWorkflow({ plan, result = {}, fulfillment = null }) {
  if (!plan || plan.schema !== "ckbuilder-agent-workflow-plan/v1") {
    throw new AppError("AGENT_WORKFLOW_PLAN_INVALID", "A valid workflow plan is required.");
  }
  const trace = Array.isArray(result.toolTrace) ? result.toolTrace : [];
  const successful = trace.filter((item) => item.status === "ok");
  const failed = trace.filter((item) => item.status === "error");
  const approvals = trace.filter((item) => item.status === "approval-required");
  const observedPlugins = [...new Set(successful.map((item) => item.pluginId).filter(Boolean))].sort();
  const requiredSources = plan.evidencePolicy?.anyEvidenceFrom ?? [];
  const matchedSources = requiredSources.filter((id) => observedPlugins.includes(id));
  const enoughCalls = successful.length >= (Number(plan.evidencePolicy?.minSuccessfulToolCalls) || 0);
  const sourceSatisfied = requiredSources.length === 0 || matchedSources.length > 0;
  const outputPresent = Boolean(String(result.text ?? "").trim());
  const approvalPending = Boolean(result.approvalRequired) || approvals.length > 0;

  let score = outputPresent ? 35 : 0;
  if (enoughCalls) score += 25;
  if (sourceSatisfied) score += 25;
  if (!failed.length) score += 10;
  if (!approvalPending) score += 5;
  score = Math.max(0, Math.min(100, score));

  const blockers = [];
  if (!outputPresent) blockers.push("No final agent output was produced.");
  if (!enoughCalls) blockers.push(`Evidence policy requires at least ${plan.evidencePolicy.minSuccessfulToolCalls} successful tool call(s).`);
  if (!sourceSatisfied) blockers.push(`No successful evidence was collected from the required source set: ${requiredSources.join(", ")}.`);
  if (approvalPending) blockers.push("A non-read-only tool is waiting for exact-argument human approval.");

  const recoveryActions = [];
  for (const item of failed.slice(0, 6)) recoveryActions.push(`Retry or replace ${item.tool} (${item.code ?? "TOOL_ERROR"}) while preserving the failed call in the audit trace.`);
  if (!sourceSatisfied && requiredSources.length) recoveryActions.push(`Collect one successful read-only observation from: ${requiredSources.join(", ")}.`);
  if (approvalPending) recoveryActions.push("Resume only after a human approves the exact tool and arguments hash; otherwise continue without that operation.");
  if (!recoveryActions.length) recoveryActions.push("No automatic recovery is required; preserve the checkpoint and receipt for independent verification.");

  let state = "completed";
  if (approvalPending) state = "waiting-approval";
  else if (!outputPresent) state = "blocked";
  else if (!enoughCalls || !sourceSatisfied || failed.length) state = "completed-with-evidence-gaps";

  const completedNodeIds = state === "completed" || state === "completed-with-evidence-gaps" ? plan.nodes.map((node) => node.id) : [];
  const evaluation = {
    schema: "ckbuilder-agent-workflow-evaluation/v1",
    planHash: plan.planHash,
    state,
    confidence: {
      score,
      level: score >= 80 ? "high" : score >= 55 ? "medium" : "low",
      basis: "deterministic score from output presence, evidence-policy coverage, tool failures, and approval state"
    },
    evidence: {
      successfulToolCalls: successful.length,
      failedToolCalls: failed.length,
      approvalRequiredCalls: approvals.length,
      observedPlugins,
      requiredSources,
      matchedSources
    },
    completedNodeIds,
    blockers,
    recoveryActions,
    fulfillmentVerdict: fulfillment?.verdict ?? null
  };
  return { ...evaluation, evaluationHash: `sha256:${digest(evaluation)}` };
}

export function createAgentWorkflowCheckpoint({ plan, evaluation, result = {}, createdAt = new Date().toISOString() }) {
  if (!plan || !evaluation) throw new AppError("AGENT_WORKFLOW_CHECKPOINT_INVALID", "plan and evaluation are required.");
  const core = {
    schema: "ckbuilder-agent-workflow-checkpoint/v1",
    createdAt,
    serviceId: plan.serviceId,
    planHash: plan.planHash,
    evaluationHash: evaluation.evaluationHash,
    state: evaluation.state,
    completedNodeIds: evaluation.completedNodeIds ?? [],
    approvalRequired: result.approvalRequired ? {
      tool: result.approvalRequired.tool,
      pluginId: result.approvalRequired.pluginId,
      argumentsHash: result.approvalRequired.argumentsHash
    } : null,
    toolTraceHash: `sha256:${digest(result.toolTrace ?? [])}`,
    outputHash: `sha256:${digest(String(result.text ?? ""))}`,
    nextActions: evaluation.recoveryActions ?? []
  };
  return { ...core, checkpointHash: `sha256:${digest(core)}` };
}

export function verifyAgentWorkflowCheckpoint(checkpoint) {
  if (!checkpoint || checkpoint.schema !== "ckbuilder-agent-workflow-checkpoint/v1") {
    throw new AppError("AGENT_WORKFLOW_CHECKPOINT_INVALID", "Unsupported or missing workflow checkpoint.");
  }
  const { checkpointHash, ...core } = checkpoint;
  const expectedCheckpointHash = `sha256:${digest(core)}`;
  return {
    schema: "ckbuilder-agent-workflow-checkpoint-verification/v1",
    valid: checkpointHash === expectedCheckpointHash,
    checkpointHash: checkpointHash ?? null,
    expectedCheckpointHash,
    state: checkpoint.state,
    serviceId: checkpoint.serviceId,
    resumable: checkpointHash === expectedCheckpointHash && checkpoint.state !== "completed",
    nextActions: Array.isArray(checkpoint.nextActions) ? checkpoint.nextActions : []
  };
}
