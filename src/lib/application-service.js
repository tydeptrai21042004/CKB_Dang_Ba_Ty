import { AppError } from "./errors.js";
import { runCkbAgent } from "./ai-service.js";

const APPLICATIONS = [
  {
    id: "fiber-operator-diagnostics",
    title: "Fiber Node Operator Diagnostics",
    audience: "Fiber node operators, payment apps, routing/liquidity operators",
    description: "Inspect a live FNN node and turn node, peer, channel, payment, and graph evidence into an operational diagnosis.",
    agent: "ckb-rpc-debugger",
    plugins: ["fiber-rpc", "ckb-docs"],
    requires: ["FIBER_RPC_URL"],
    example: "My Fiber node is online but payments keep failing. Find the most likely operational cause and tell me what to check next.",
    deliverables: ["health summary", "peer/channel/payment evidence", "likely failure causes", "safe operator actions", "unknowns that require manual confirmation"],
    evidenceRules: "Prefer live Fiber RPC evidence over assumptions. Do not open/close channels, send payments, sign, or expose node wallet secrets."
  },
  {
    id: "transaction-forensics",
    title: "CKB Transaction Failure Lab",
    audience: "dApp builders, Script developers, wallet integrators",
    description: "Investigate a transaction hash or raw transaction using CKB RPC, indexer data, dry-run evidence, and current official docs.",
    agent: "ckb-transaction-reviewer",
    plugins: ["ckb-rpc", "ckb-docs"],
    requires: ["CKB_RPC_URL"],
    example: "This transaction is rejected after I add a Type Script output. Identify whether the problem is CellDeps, capacity, witnesses, or Script execution.",
    deliverables: ["transaction shape", "live-input/output evidence", "Script/cycle failure evidence when available", "root-cause ranking", "minimal reproduction/checklist"],
    evidenceRules: "Use get_transaction/get_live_cell/dry_run/indexer tools when possible. Never broadcast or sign a transaction."
  },
  {
    id: "script-debug-lab",
    title: "CKB Script Debug & Test Lab",
    audience: "Rust/CKB-VM Script developers",
    description: "Combine repository evidence, transaction context, official testing guidance, and CKB RPC facts into a concrete debugging plan.",
    agent: "ckb-cell-debugger",
    plugins: ["ckb-workspace", "ckb-docs", "ckb-rpc"],
    requires: ["CKB_AGENT_WORKSPACE"],
    example: "My Lock Script passes ckb-testtool but fails in a real transaction with an error code. Inspect the project and build the smallest failing test/debugger path.",
    deliverables: ["suspected Script boundary", "reproduction path", "success/failure test matrix", "ckb-testtool/ckb-debugger commands", "deployment/version checks"],
    evidenceRules: "Read source files only from the configured workspace. Do not execute arbitrary shell commands or read secret files."
  },
  {
    id: "asset-provenance",
    title: "xUDT / Spore / RGB++ Asset Investigator",
    audience: "wallets, explorers, marketplaces, asset protocol builders",
    description: "Trace Cells and transactions and explain which asset model is present, what is verifiable on CKB, and which provenance claims remain external.",
    agent: "ckb-transaction-reviewer",
    plugins: ["ckb-rpc", "ckb-docs"],
    requires: ["CKB_RPC_URL"],
    example: "Inspect this transaction/out point and explain whether it looks like xUDT, Spore/DOB, or RGB++, including what can and cannot be proven from CKB alone.",
    deliverables: ["Cell/type-script inventory", "asset-model identification evidence", "ownership/state transition explanation", "provenance limits", "integration next steps"],
    evidenceRules: "Do not infer protocol identity from a label alone. Verify code/type information against current official protocol documentation whenever possible."
  },
  {
    id: "contribution-finder",
    title: "CKB Community Contribution Finder",
    audience: "new contributors, CKBuilders, maintainers, study groups",
    description: "Search active CKB repositories and community discussion, then match concrete open work to a contributor's skills and learning level.",
    agent: "ckb-developer",
    plugins: ["ckb-github", "ckb-community", "ckb-docs"],
    requires: [],
    example: "I know TypeScript and backend systems. Find current CKB/Fiber/CCC issues where I could make a useful first contribution this week.",
    deliverables: ["current candidate issues", "why each is a fit", "prerequisite docs", "small first milestone", "questions to ask maintainers"],
    evidenceRules: "Use current repository/community data. Do not invent issue status, maintainers, or project priority."
  },
  {
    id: "research-brief",
    title: "CKB Protocol & Ecosystem Research Brief",
    audience: "researchers, proposal authors, technical writers, ecosystem teams",
    description: "Build an evidence-backed brief from official docs, active repositories, and current Nervos community discussion instead of model memory.",
    agent: "ckb-developer",
    plugins: ["ckb-docs", "ckb-github", "ckb-community"],
    requires: [],
    example: "Research whether an AI-assisted micropayment service should use Fiber directly, on-chain xUDT transfers, or a hybrid design, and identify open technical risks.",
    deliverables: ["current-state evidence", "architecture alternatives", "ecosystem fit", "open risks/unknowns", "prototype/research agenda"],
    evidenceRules: "Separate official facts, community discussion, and your own inference. Flag version-sensitive or alpha components."
  },
  {
    id: "dapp-architecture",
    title: "CKB dApp Architecture Advisor",
    audience: "hackathon teams, startups, application developers",
    description: "Translate a product idea into a CKB-native architecture using Cells, CCC, xUDT, Spore, RGB++, Fiber, and maintained tooling where they actually fit.",
    agent: "ckb-developer",
    plugins: ["ckb-docs", "ckb-community"],
    requires: [],
    example: "Design a creator marketplace with wallet login, collectible content, micropayments, and Bitcoin-linked assets. Decide where CCC, Spore, Fiber, and RGB++ belong.",
    deliverables: ["CKB-native component map", "recommended protocols/tools", "transaction/state boundaries", "MVP milestones", "security and operability risks"],
    evidenceRules: "Prefer current maintained CKB tools and official guidance. Do not force every ecosystem protocol into the design."
  }
];

function clean(value, name, max) {
  const text = String(value ?? "").trim();
  if (!text) throw new AppError("CKB_APPLICATION_INPUT_REQUIRED", `${name} is required.`);
  if (text.length > max) throw new AppError("CKB_APPLICATION_INPUT_TOO_LONG", `${name} must be at most ${max} characters.`);
  return text;
}

function statusFor(app, config = {}) {
  const missing = app.requires.filter((key) => !String(config[key] ?? "").trim());
  return { ready: missing.length === 0, missingConfig: missing };
}

export function ckbApplicationCatalog(config = {}) {
  return APPLICATIONS.map((app) => ({
    id: app.id,
    title: app.title,
    audience: app.audience,
    description: app.description,
    agent: app.agent,
    plugins: [...app.plugins],
    requires: [...app.requires],
    example: app.example,
    deliverables: [...app.deliverables],
    ...statusFor(app, config)
  }));
}

export function getCkbApplication(id) {
  const normalized = String(id ?? "").trim().toLowerCase();
  const app = APPLICATIONS.find((item) => item.id === normalized);
  if (!app) throw new AppError("CKB_APPLICATION_NOT_FOUND", "Unknown CKB real-world application workflow.");
  return app;
}

export function prepareCkbApplicationRun(input, config = {}) {
  const app = getCkbApplication(input?.applicationId ?? input?.application);
  const objective = clean(input?.objective ?? input?.goal ?? input?.task, "objective", 6000);
  const context = input?.context == null ? "No extra context supplied." : (typeof input.context === "string" ? input.context : JSON.stringify(input.context, null, 2));
  if (context.length > 24000) throw new AppError("CKB_APPLICATION_CONTEXT_TOO_LONG", "context must be at most 24000 characters.");
  const runtimeStatus = statusFor(app, config);
  const task = `Run the real-world CKBuilder workflow: ${app.title}.

USER OBJECTIVE
${objective}

WORKFLOW PURPOSE
${app.description}

REQUIRED DELIVERABLES
${app.deliverables.map((item, index) => `${index + 1}. ${item}`).join("\n")}

EVIDENCE RULES
${app.evidenceRules}

If required runtime configuration is missing, continue with the evidence that is available, clearly name the missing configuration, and give the smallest safe step needed to enable live evidence. Do not pretend a live check ran when it did not.`;
  return {
    application: { id: app.id, title: app.title, audience: app.audience, deliverables: [...app.deliverables], ...runtimeStatus },
    agentInput: {
      agent: app.agent,
      task,
      context: {
        applicationId: app.id,
        userContext: context,
        deployment: {
          network: config.APP_NETWORK ?? "unknown",
          ckbRpcConfigured: Boolean(config.CKB_RPC_URL),
          fiberRpcConfigured: Boolean(config.FIBER_RPC_URL),
          workspaceConfigured: Boolean(config.CKB_AGENT_WORKSPACE)
        }
      },
      plugins: [...app.plugins],
      maxSteps: Number.isFinite(Number(input?.maxSteps)) ? Math.max(2, Math.min(6, Number(input.maxSteps))) : 6,
      approvedTools: Array.isArray(input?.approvedTools) ? input.approvedTools.slice(0, 8) : []
    }
  };
}

export async function runCkbApplication(headers, input, config, options = {}) {
  const prepared = prepareCkbApplicationRun(input, config);
  const result = await runCkbAgent(headers, prepared.agentInput, config.AI_DEFAULT_MODEL, config.AI_DEFAULT_PROVIDER, {
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
  return { application: prepared.application, ...result };
}
