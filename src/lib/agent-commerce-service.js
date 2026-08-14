import crypto from "node:crypto";
import { AppError } from "./errors.js";
import { runCkbAgent } from "./ai-service.js";
import { aiPluginCatalog, quoteFiberPayment, verifyFiberPayment } from "./plugin-service.js";
import { loadOrCreateAgentServiceIdentity, publicAgentServiceIdentity, signAgentReceiptHash, verifyAgentReceiptSignature } from "./agent-identity.js";

const BUILTIN_SERVICES = Object.freeze([
  {
    id: "ckb-launch-readiness-team",
    title: "CKB Launch Readiness Team",
    category: "engineering",
    kind: "team",
    audience: "CKB dApp teams preparing a testnet/mainnet release",
    description: "A multi-agent release gate that combines current protocol/tooling research, repository/security review, and live CKB/Fiber operational checks when configured.",
    outcome: "One evidence-backed GO / CONDITIONAL GO / NO-GO report with blockers, owners, and the smallest next validation steps.",
    requires: [],
    optionalConfig: ["CKB_AGENT_WORKSPACE", "CKB_RPC_URL", "FIBER_RPC_URL"],
    payment: { rail: "Fiber", mode: "quote-only", autonomousSpend: false },
    evaluation: { minSuccessfulToolCalls: 1, anyEvidenceFrom: ["ckb-docs", "ckb-github", "ckb-workspace", "ckb-rpc", "fiber-rpc"] },
    roles: [
      {
        id: "ecosystem-researcher", name: "Ecosystem Researcher", agent: "ckb-developer", plugins: ["ckb-docs", "ckb-github"],
        prompt: "Check current CKB tooling, protocol, SDK, release, and known-issue evidence relevant to the objective. Flag version-sensitive dependencies and upstream risks."
      },
      {
        id: "security-builder", name: "Security & Build Reviewer", agent: "ckb-security-reviewer", plugins: ["ckb-workspace", "ckb-docs"],
        prompt: "Review architecture and, when the configured workspace is available, repository evidence. Focus on signing boundaries, Cell/Script assumptions, tests, secret handling, dependencies, and release blockers. Never claim source inspection happened if the workspace is unavailable."
      },
      {
        id: "network-operator", name: "Network Operator", agent: "ckb-rpc-debugger", plugins: ["ckb-rpc", "fiber-rpc", "ckb-docs"],
        prompt: "Assess live CKB/Fiber readiness when endpoints are configured: node/network state, transaction/RPC integration risks, Fiber operator state, and deployment observability. Missing live configuration must be reported as unverified rather than treated as healthy."
      }
    ]
  },
  {
    id: "fiber-agent-commerce",
    title: "Fiber Agent Commerce Planner",
    category: "payments",
    kind: "single",
    audience: "AI services, creator tools, bots, marketplaces, and machine-to-machine payment experiments",
    description: "Design an agent-to-agent service/payment flow on Fiber, inspect live routing/node evidence, and optionally attach a dry-run payment quote without allowing the model to spend funds.",
    outcome: "Service contract + payment flow + dry-run fee/route evidence + human execution boundary + receipt/settlement plan.",
    agent: "ckb-rpc-debugger",
    plugins: ["fiber-rpc", "ckb-docs", "ckb-community"],
    requires: ["FIBER_RPC_URL"],
    optionalConfig: [],
    payment: { rail: "Fiber", mode: "dry-run-quote", autonomousSpend: false },
    evaluation: { minSuccessfulToolCalls: 1, anyEvidenceFrom: ["fiber-rpc"] }
  },
  {
    id: "ckb-agent-service-designer",
    title: "CKB Community Agent Service Designer",
    category: "community",
    kind: "single",
    audience: "CKB projects that want to expose useful capabilities to AI agents",
    description: "Turn a CKB project/API/MCP idea into a reviewable community agent service with capability boundaries, read/write permissions, evidence rules, pricing/settlement options, and contributor tests.",
    outcome: "Agent service contract, MCP/plugin capability map, trust model, test matrix, and community contribution path.",
    agent: "ckb-developer",
    plugins: ["ckb-docs", "ckb-github", "ckb-community"],
    requires: [],
    optionalConfig: [],
    payment: { rail: "Fiber-ready", mode: "design-only", autonomousSpend: false },
    evaluation: { minSuccessfulToolCalls: 1, anyEvidenceFrom: ["ckb-docs", "ckb-github", "ckb-community"] }
  },
  {
    id: "ckb-verifiable-research",
    title: "Verifiable CKB Research Service",
    category: "research",
    kind: "single",
    audience: "researchers, grant/proposal teams, technical writers, ecosystem analysts",
    description: "Produce a current CKB research result with explicit sources/tools, confidence boundaries, and a cryptographic job receipt suitable for later anchoring in a CKB Cell or Spore object.",
    outcome: "Evidence-backed research brief + tool trace + content hashes + portable receipt anchor payload.",
    agent: "ckb-developer",
    plugins: ["ckb-docs", "ckb-github", "ckb-community"],
    requires: [],
    optionalConfig: [],
    payment: { rail: "Fiber-ready", mode: "receipt-first", autonomousSpend: false },
    evaluation: { minSuccessfulToolCalls: 1, anyEvidenceFrom: ["ckb-docs", "ckb-github", "ckb-community"] }
  }
]);

function boundedString(value, label, max = 6000) {
  const text = String(value ?? "").trim();
  if (!text) throw new AppError("AGENT_SERVICE_INPUT_REQUIRED", `${label} is required.`);
  if (text.length > max) throw new AppError("AGENT_SERVICE_INPUT_TOO_LONG", `${label} must be at most ${max} characters.`);
  return text;
}

function configStatus(service, config = {}) {
  const missing = (service.requires ?? []).filter((key) => !String(config[key] ?? "").trim());
  const optionalReady = (service.optionalConfig ?? []).filter((key) => String(config[key] ?? "").trim());
  return { ready: missing.length === 0, missingConfig: missing, optionalEvidenceReady: optionalReady };
}

function publicService(service, config = {}) {
  return {
    id: service.id, title: service.title, category: service.category, kind: service.kind, audience: service.audience,
    description: service.description, outcome: service.outcome, payment: service.payment, evaluation: service.evaluation ?? { minSuccessfulToolCalls: 0, anyEvidenceFrom: [] },
    roles: service.roles?.map(({ id, name }) => ({ id, name })) ?? [],
    ...configStatus(service, config)
  };
}

function communityServices(config = {}, rootDir = process.cwd()) {
  return aiPluginCatalog(rootDir)
    .filter((plugin) => plugin.transport === "mcp" && plugin.trust !== "official")
    .map((plugin) => ({
      id: `community-${plugin.id}`,
      title: `${plugin.name} Service`,
      category: "community-mcp",
      kind: "community",
      audience: "CKB users who want to delegate a task to a community MCP capability",
      description: `${plugin.description} CKBuilder discovers its MCP tools at runtime and keeps every tool behind the plugin permission/audit boundary.`,
      outcome: "Delegated result + MCP tool trace + trust/risk metadata + cryptographic CKBuilder job receipt.",
      agent: "ckb-developer", plugins: [plugin.id, "ckb-docs"], requires: [], optionalConfig: [],
      payment: { rail: "external/Fiber-ready", mode: "service-defined", autonomousSpend: false },
      evaluation: { minSuccessfulToolCalls: 1, anyEvidenceFrom: [plugin.id] },
      communityPluginId: plugin.id,
      ...configStatus({ requires: [] }, config)
    }));
}

export function agentServiceCatalog(config = {}, rootDir = process.cwd()) {
  return [...BUILTIN_SERVICES.map((service) => publicService(service, config)), ...communityServices(config, rootDir)];
}

export function getAgentService(id, config = {}, rootDir = process.cwd()) {
  const normalized = String(id ?? "").trim().toLowerCase();
  const builtin = BUILTIN_SERVICES.find((service) => service.id === normalized);
  if (builtin) return builtin;
  const community = communityServices(config, rootDir).find((service) => service.id === normalized);
  if (community) return community;
  throw new AppError("AGENT_SERVICE_NOT_FOUND", "Unknown CKB agent service.");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export function createAgentServiceAgreement({ service, objective, input = {}, createdAt = new Date().toISOString() }) {
  const maxSteps = Math.max(2, Math.min(6, Number(input.maxSteps) || 5));
  const evidencePolicy = service.evaluation ?? { minSuccessfulToolCalls: 0, anyEvidenceFrom: [] };
  const core = {
    schema: "ckbuilder-agent-service-agreement/v1",
    serviceId: service.id,
    createdAt,
    objectiveHash: `sha256:${digest(String(objective))}`,
    expectedOutcome: service.outcome,
    executionTerms: {
      maxSteps,
      autonomousSpend: false,
      signingAuthority: false,
      broadcastAuthority: false,
      paymentMode: service.payment?.mode ?? "none"
    },
    evidencePolicy: {
      minSuccessfulToolCalls: Math.max(0, Number(evidencePolicy.minSuccessfulToolCalls) || 0),
      anyEvidenceFrom: [...new Set(evidencePolicy.anyEvidenceFrom ?? [])].sort()
    }
  };
  const agreementHash = digest(core);
  return { ...core, agreementId: `agr_${agreementHash.slice(0, 20)}`, agreementHash: `sha256:${agreementHash}` };
}

export function verifyAgentServiceAgreement(agreement, { service, objective }) {
  if (!agreement || agreement.schema !== "ckbuilder-agent-service-agreement/v1") throw new AppError("AGENT_SERVICE_AGREEMENT_INVALID", "A valid CKBuilder service agreement is required.");
  const { agreementId, agreementHash, ...core } = agreement; const computed = digest(core);
  const expectedPolicy = service.evaluation ?? { minSuccessfulToolCalls: 0, anyEvidenceFrom: [] };
  const expectedEvidence = [...new Set(expectedPolicy.anyEvidenceFrom ?? [])].sort();
  const valid = agreementHash === `sha256:${computed}` && agreementId === `agr_${computed.slice(0, 20)}` && agreement.serviceId === service.id && agreement.objectiveHash === `sha256:${digest(String(objective))}` && agreement.expectedOutcome === service.outcome && agreement.executionTerms?.autonomousSpend === false && agreement.executionTerms?.signingAuthority === false && agreement.executionTerms?.broadcastAuthority === false && agreement.executionTerms?.paymentMode === (service.payment?.mode ?? "none") && Number(agreement.executionTerms?.maxSteps) >= 2 && Number(agreement.executionTerms?.maxSteps) <= 6 && Number(agreement.evidencePolicy?.minSuccessfulToolCalls) === (Number(expectedPolicy.minSuccessfulToolCalls) || 0) && JSON.stringify(agreement.evidencePolicy?.anyEvidenceFrom ?? []) === JSON.stringify(expectedEvidence);
  if (!valid) throw new AppError("AGENT_SERVICE_AGREEMENT_MISMATCH", "The service agreement was modified or does not match this objective/service policy.");
  return true;
}

export function evaluateAgentServiceFulfillment({ service, result, agreement }) {
  const trace = Array.isArray(result?.toolTrace) ? result.toolTrace : [];
  const successful = trace.filter((item) => item.status === "ok");
  const failed = trace.filter((item) => item.status !== "ok");
  const executedPlugins = [...new Set(successful.map((item) => item.pluginId).filter(Boolean))].sort();
  const policy = agreement?.evidencePolicy ?? service.evaluation ?? { minSuccessfulToolCalls: 0, anyEvidenceFrom: [] };
  const expected = [...new Set(policy.anyEvidenceFrom ?? [])].sort();
  const matchedEvidence = expected.filter((id) => executedPlugins.includes(id));
  const enoughCalls = successful.length >= (Number(policy.minSuccessfulToolCalls) || 0);
  const sourceSatisfied = expected.length === 0 || matchedEvidence.length > 0;
  const outputPresent = Boolean(String(result?.text ?? "").trim());
  const approvalPending = Boolean(result?.approvalRequired);
  let verdict = "fulfilled";
  if (approvalPending || !outputPresent) verdict = "blocked";
  else if (!enoughCalls || !sourceSatisfied || failed.length > 0) verdict = "fulfilled-with-evidence-gaps";
  return {
    schema: "ckbuilder-agent-service-fulfillment/v1",
    serviceId: service.id,
    agreementId: agreement?.agreementId ?? null,
    verdict,
    outputPresent,
    approvalPending,
    successfulToolCalls: successful.length,
    failedToolCalls: failed.length,
    executedPlugins,
    evidencePolicy: { minSuccessfulToolCalls: Number(policy.minSuccessfulToolCalls) || 0, anyEvidenceFrom: expected },
    matchedEvidence,
    missingEvidence: expected.length && matchedEvidence.length === 0 ? expected : []
  };
}

export function createAgentJobReceipt({ service, objective, result, paymentQuote = null, agreement = null, fulfillment = null, identity = null, createdAt = new Date().toISOString(), jobId = crypto.randomUUID() }) {
  const evidence = (result?.toolTrace ?? []).map((item) => ({ pluginId: item.pluginId, tool: item.tool, status: item.status, risk: item.risk ?? "read", argumentsHash: item.argumentsHash ?? null }));
  const core = {
    schema: "ckbuilder-agent-job-receipt/v2",
    jobId,
    serviceId: service.id,
    createdAt,
    objectiveHash: `sha256:${digest(String(objective))}`,
    outputHash: `sha256:${digest(String(result?.text ?? ""))}`,
    evidenceHash: `sha256:${digest(evidence)}`,
    paymentQuoteHash: paymentQuote ? `sha256:${digest(paymentQuote)}` : null,
    agreementHash: agreement?.agreementHash ?? null,
    fulfillmentHash: fulfillment ? `sha256:${digest(fulfillment)}` : null,
    workflowHash: result?.workflow ? `sha256:${digest(result.workflow)}` : null,
    execution: { agent: result?.agent ?? null, provider: result?.provider ?? null, model: result?.model ?? null, steps: result?.steps ?? null },
    evidence
  };
  const receiptHash = `sha256:${digest(core)}`;
  const publicIdentity = identity ? publicAgentServiceIdentity(identity) : null;
  const authenticity = publicIdentity ? {
    mode: "ed25519",
    serviceIdentity: publicIdentity.serviceId,
    algorithm: publicIdentity.algorithm,
    issuerPublicKey: publicIdentity.publicKeyDer,
    signature: signAgentReceiptHash(identity, receiptHash)
  } : { mode: "unsigned", serviceIdentity: null, algorithm: null, issuerPublicKey: null, signature: null };
  return {
    ...core,
    receiptHash,
    authenticity,
    anchor: {
      scheme: "ckbuilder-agent-receipt/v2",
      digestHex: `0x${receiptHash.slice(7)}`,
      suggestedCellDataHex: `0x${Buffer.from("CKBA1", "utf8").toString("hex")}${receiptHash.slice(7)}`,
      note: "Application-defined receipt anchor payload; not an official CKB protocol or standard. A wallet/user must create and sign any anchoring transaction."
    }
  };
}

function serviceTask(service, objective, context) {
  return `Execute the CKBuilder agent service: ${service.title}.\n\nSERVICE PURPOSE\n${service.description}\n\nUSER OBJECTIVE\n${objective}\n\nEXPECTED OUTCOME\n${service.outcome}\n\nSERVICE RULES\n- Use live/read-only tools when they can verify a claim.\n- Clearly separate observed evidence from inference.\n- Do not sign, broadcast, open/close channels, or send a payment.\n- If payment is relevant, describe the human approval boundary and use only supplied dry-run quote evidence.\n\nUSER CONTEXT\n${context}`;
}

async function runSingleService(headers, service, objective, context, config, input, options) {
  return runCkbAgent(headers, {
    agent: service.agent ?? "auto",
    task: serviceTask(service, objective, context),
    context: { serviceId: service.id, userContext: context, paymentQuote: input.paymentQuote ?? null },
    plugins: service.plugins ?? [],
    maxSteps: Math.max(2, Math.min(6, Number(input.maxSteps) || 5)),
    approvedTools: Array.isArray(input.approvedTools) ? input.approvedTools.slice(0, 8) : [],
    approvedOperations: Array.isArray(input.approvedOperations) ? input.approvedOperations.slice(0, 8) : []
  }, config.AI_DEFAULT_MODEL, config.AI_DEFAULT_PROVIDER, {
    rootDir: config.ROOT_DIR ?? options.rootDir,
    rpcUrl: config.CKB_RPC_URL,
    fiberRpcUrl: config.FIBER_RPC_URL,
    workspaceDir: config.CKB_AGENT_WORKSPACE,
    githubToken: config.CKB_GITHUB_TOKEN,
    fetchImpl: options.fetchImpl,
    toolFetchImpl: options.toolFetchImpl,
    timeoutMs: options.timeoutMs,
    toolTimeoutMs: options.toolTimeoutMs
  });
}

async function runTeamService(headers, service, objective, context, config, input, options) {
  const workerIds = service.roles.map((role) => `role:${role.id}`);
  const workerRuns = service.roles.map(async (role) => {
    const startedAt = new Date().toISOString();
    const report = await runCkbAgent(headers, {
      agent: role.agent,
      task: `${role.prompt}\n\nRelease objective: ${objective}\n\nShared context: ${context}`,
      context: { serviceId: service.id, role: role.id },
      plugins: role.plugins,
      maxSteps: Math.max(2, Math.min(4, Number(input.roleMaxSteps) || 3)),
      approvedTools: [], approvedOperations: []
    }, config.AI_DEFAULT_MODEL, config.AI_DEFAULT_PROVIDER, {
      rootDir: config.ROOT_DIR ?? options.rootDir,
      rpcUrl: config.CKB_RPC_URL,
      fiberRpcUrl: config.FIBER_RPC_URL,
      workspaceDir: config.CKB_AGENT_WORKSPACE,
      githubToken: config.CKB_GITHUB_TOKEN,
      fetchImpl: options.fetchImpl,
      toolFetchImpl: options.toolFetchImpl,
      timeoutMs: options.timeoutMs,
      toolTimeoutMs: options.toolTimeoutMs
    });
    return {
      role: role.id, roleName: role.name, text: report.text, toolTrace: report.toolTrace,
      provider: report.provider, model: report.model, steps: report.steps,
      approvalRequired: report.approvalRequired ?? null, startedAt, completedAt: new Date().toISOString()
    };
  });
  const reports = await Promise.all(workerRuns);
  const approval = reports.find((report) => report.approvalRequired);
  const baseWorkflow = {
    schema: "ckbuilder-agent-workflow/v1",
    mode: "parallel-specialists-then-synthesis",
    nodes: reports.map((report) => ({ id: `role:${report.role}`, type: "specialist", dependsOn: [], status: report.approvalRequired ? "waiting-approval" : "completed", steps: report.steps, startedAt: report.startedAt, completedAt: report.completedAt }))
  };
  if (approval) return { text: approval.text, toolTrace: reports.flatMap((report) => report.toolTrace ?? []), approvalRequired: approval.approvalRequired, teamReports: reports, workflow: { ...baseWorkflow, nodes: [...baseWorkflow.nodes, { id: "synthesis", type: "synthesis", dependsOn: workerIds, status: "blocked" }] } };

  const synthesisContext = reports.map((report) => `### ${report.roleName}\n${report.text}`).join("\n\n").slice(0, 30000);
  const synthesisStartedAt = new Date().toISOString();
  const final = await runCkbAgent(headers, {
    agent: "ckb-security-reviewer",
    task: `Act as release chair. Produce one GO / CONDITIONAL GO / NO-GO decision for this CKB release objective: ${objective}. Reconcile the specialist reports below, rank blockers by severity, list evidence gaps, and assign the smallest next validation steps. Never upgrade an unverified claim into a fact.\n\nSPECIALIST REPORTS\n${synthesisContext}`,
    context: { serviceId: service.id, specialistCount: reports.length },
    plugins: ["ckb-docs"], maxSteps: 2
  }, config.AI_DEFAULT_MODEL, config.AI_DEFAULT_PROVIDER, {
    rootDir: config.ROOT_DIR ?? options.rootDir,
    fetchImpl: options.fetchImpl,
    toolFetchImpl: options.toolFetchImpl,
    timeoutMs: options.timeoutMs,
    toolTimeoutMs: options.toolTimeoutMs
  });
  const workflow = {
    ...baseWorkflow,
    nodes: [...baseWorkflow.nodes, { id: "synthesis", type: "synthesis", dependsOn: workerIds, status: final.approvalRequired ? "waiting-approval" : "completed", steps: final.steps, startedAt: synthesisStartedAt, completedAt: new Date().toISOString() }]
  };
  return {
    ...final,
    teamReports: reports,
    workflow,
    toolTrace: reports.flatMap((report) => report.toolTrace.map((item) => ({ ...item, role: report.role }))).concat(final.toolTrace ?? []),
    team: { serviceId: service.id, roles: reports.map((report) => ({ id: report.role, name: report.roleName, steps: report.steps })), execution: "parallel-specialists-then-synthesis" }
  };
}

export async function runAgentService(headers, input, config = {}, options = {}) {
  const rootDir = config.ROOT_DIR ?? options.rootDir ?? process.cwd();
  const service = getAgentService(input?.serviceId ?? input?.service, config, rootDir);
  const objective = boundedString(input?.objective ?? input?.task, "objective", 6000);
  const context = input?.context == null ? "No additional context supplied." : (typeof input.context === "string" ? input.context : JSON.stringify(input.context, null, 2));
  if (context.length > 24000) throw new AppError("AGENT_SERVICE_CONTEXT_TOO_LONG", "context must be at most 24000 characters.");
  const agreement = input?.agreement ?? createAgentServiceAgreement({ service, objective, input });
  if (input?.agreement) verifyAgentServiceAgreement(agreement, { service, objective });
  const rawResult = service.kind === "team"
    ? await runTeamService(headers, service, objective, context, config, input, options)
    : await runSingleService(headers, service, objective, context, config, input, options);
  const result = rawResult.workflow ? rawResult : { ...rawResult, workflow: { schema: "ckbuilder-agent-workflow/v1", mode: "single-agent", nodes: [{ id: "agent", type: "agent", dependsOn: [], status: rawResult.approvalRequired ? "waiting-approval" : "completed", steps: rawResult.steps ?? null }] } };
  const fulfillment = evaluateAgentServiceFulfillment({ service, result, agreement });
  if (result.approvalRequired) return { service: publicService(service, config), agreement, fulfillment, ...result };
  const identity = config.DATA_DIR ? loadOrCreateAgentServiceIdentity(config.DATA_DIR) : null;
  const receipt = createAgentJobReceipt({ service, objective, result, paymentQuote: input?.paymentQuote ?? null, agreement, fulfillment, identity });
  return { service: publicService(service, config), agreement, fulfillment, ...result, receipt };
}

export function verifyAgentJobReceipt(receipt, { agreement = null, fulfillment = null } = {}) {
  if (!receipt || !new Set(["ckbuilder-agent-job-receipt/v1", "ckbuilder-agent-job-receipt/v2"]).has(receipt.schema)) throw new AppError("AGENT_RECEIPT_INVALID", "Unsupported or missing CKBuilder agent receipt.");
  const { receiptHash, anchor, authenticity, ...core } = receipt;
  const expected = `sha256:${digest(core)}`;
  const v2 = receipt.schema === "ckbuilder-agent-job-receipt/v2";
  const prefix = Buffer.from("CKBA1", "utf8").toString("hex");
  const checks = {
    receiptHash: receiptHash === expected,
    anchorDigest: anchor?.digestHex === `0x${expected.slice(7)}`,
    anchorPayload: anchor?.suggestedCellDataHex === `0x${prefix}${expected.slice(7)}`
  };
  if (agreement) {
    const { agreementId, agreementHash, ...agreementCore } = agreement;
    checks.agreementHash = agreementHash === `sha256:${digest(agreementCore)}` && receipt.agreementHash === agreementHash;
    checks.agreementId = agreementId === `agr_${digest(agreementCore).slice(0, 20)}`;
  }
  if (fulfillment) checks.fulfillmentHash = receipt.fulfillmentHash === `sha256:${digest(fulfillment)}`;
  const signaturePresent = Boolean(authenticity?.signature && authenticity?.issuerPublicKey);
  const authenticityVerified = signaturePresent ? verifyAgentReceiptSignature({ receiptHash: expected, issuerPublicKey: authenticity.issuerPublicKey, signature: authenticity.signature }) : false;
  if (signaturePresent) checks.signature = authenticityVerified;
  return {
    schema: "ckbuilder-agent-receipt-verification/v2",
    valid: Object.values(checks).every(Boolean),
    integrityVerified: checks.receiptHash && checks.anchorDigest && checks.anchorPayload,
    authenticityVerified,
    serviceIdentity: authenticity?.serviceIdentity ?? null,
    jobId: receipt.jobId ?? null,
    serviceId: receipt.serviceId ?? null,
    checks,
    expectedReceiptHash: expected
  };
}

export async function createFiberPaymentQuote(input, config = {}, options = {}) {
  if (!String(config.FIBER_RPC_URL ?? "").trim()) throw new AppError("FIBER_RPC_NOT_CONFIGURED", "Set FIBER_RPC_URL before requesting a live Fiber payment quote.");
  const quote = await quoteFiberPayment({
    fetchImpl: options.toolFetchImpl ?? options.fetchImpl ?? fetch,
    timeoutMs: Math.min(options.toolTimeoutMs ?? 12000, 30000),
    fiberRpcUrl: config.FIBER_RPC_URL
  }, input ?? {});
  const intent = {
    schema: "ckbuilder-fiber-payment-intent/v1",
    createdAt: new Date().toISOString(),
    network: config.APP_NETWORK ?? "unknown",
    request: quote.request,
    dryRun: true,
    autonomousSpend: false,
    requiresHumanExecution: true,
    executionBoundary: "CKBuilder returns simulation evidence only. A human-controlled wallet/Fiber client must explicitly approve and execute any real payment."
  };
  return { quote: quote.result, intent, quoteHash: `sha256:${digest({ quote: quote.result, request: quote.request })}` };
}

export async function verifyFiberPaymentSettlement(input, config = {}, options = {}) {
  if (!String(config.FIBER_RPC_URL ?? "").trim()) throw new AppError("FIBER_RPC_NOT_CONFIGURED", "Set FIBER_RPC_URL before verifying a Fiber payment.");
  return verifyFiberPayment({ fetchImpl: options.toolFetchImpl ?? options.fetchImpl ?? fetch, timeoutMs: Math.min(options.toolTimeoutMs ?? 12000, 30000), fiberRpcUrl: config.FIBER_RPC_URL }, input ?? {});
}
