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
  },
  {
    id: "testnet-launch-gate",
    title: "CKB Testnet Launch Gate",
    audience: "dApp teams, hackathon teams, protocol integrators, release engineers",
    description: "Turn a planned Testnet release into a deterministic readiness workflow covering network selection, deployed Script metadata, RPC reachability, transaction assumptions, observability, and rollback evidence.",
    agent: "ckb-security-reviewer",
    plugins: ["ckb-docs", "ckb-rpc", "ckb-workspace"],
    requires: ["CKB_RPC_URL"],
    example: "I want to publish my CKB app on Testnet this week. Check the release inputs, live node assumptions, Script deployment metadata, and tell me exactly what blocks launch.",
    deliverables: ["release readiness verdict", "configured-vs-unverified evidence matrix", "Script/RPC deployment checks", "transaction and signing boundary checks", "rollback and observability checklist"],
    workflow: ["Define release target and network", "Collect live RPC and repository evidence", "Verify deployment/signing assumptions", "Rank blockers and unverified items", "Produce GO / CONDITIONAL GO / NO-GO actions"],
    evidenceRules: "Treat missing live RPC, deployment hashes, or workspace evidence as unverified. Never sign or broadcast a release transaction."
  },
  {
    id: "ccc-wallet-integration",
    title: "CCC Wallet Integration Readiness",
    audience: "frontend teams, wallet integrators, TypeScript dApp builders",
    description: "Review a CCC-based wallet connection and transaction flow from connection through intent construction, occupied-capacity assumptions, signing handoff, user confirmation, and post-submit verification.",
    agent: "ckb-transaction-reviewer",
    plugins: ["ckb-docs", "ckb-workspace"],
    requires: [],
    example: "Review my CCC wallet flow before I expose it to users. I need to know whether connect, build, sign, submit, and confirmation boundaries are clear and safe.",
    deliverables: ["wallet lifecycle map", "human approval/signing boundary", "transaction construction risks", "error/cancellation handling checklist", "minimal integration test matrix"],
    workflow: ["Map connect/account/network state", "Inspect transaction construction inputs", "Verify explicit signing and user confirmation boundary", "Check rejection/retry/network-change paths", "Produce browser + wallet integration tests"],
    evidenceRules: "Never request a seed phrase or private key. Repository evidence is optional; when unavailable, clearly label code-level checks as not inspected."
  },
  {
    id: "xudt-token-launch",
    title: "xUDT Token Launch Planner",
    audience: "token issuers, wallets, asset applications, hackathon teams",
    description: "Plan and review an xUDT lifecycle using CKB Cells: issuance assumptions, type-script identity, amount encoding, conservation, transfer construction, wallet support, and verification.",
    agent: "ckb-cell-debugger",
    plugins: ["ckb-docs", "ckb-rpc"],
    requires: [],
    example: "I want to launch an xUDT on CKB Testnet. Give me the Cell model, issuance and transfer workflow, validation checks, and tests I need before users receive tokens.",
    deliverables: ["xUDT Cell/state model", "issuance and transfer workflow", "amount/conservation checks", "wallet/indexer integration checklist", "testnet validation matrix"],
    workflow: ["Define token identity and issuance authority", "Map xUDT Cell data and Type Script", "Design transfer/conservation flow", "Check wallet/indexer discovery", "Validate mint-transfer-balance scenarios"],
    evidenceRules: "Do not infer a Type Script or token identity without evidence. Keep issuance authority and user signing boundaries explicit."
  },
  {
    id: "spore-dob-launch",
    title: "Spore / DOB Creator Launch",
    audience: "creator apps, collectible projects, marketplaces, content platforms",
    description: "Translate a digital-object idea into a Spore/DOB-oriented CKB workflow covering content commitment, ownership Cells, mutation/transfer boundaries, indexing, and user-facing provenance.",
    agent: "ckb-developer",
    plugins: ["ckb-docs", "ckb-community"],
    requires: [],
    example: "Design the Testnet workflow for a creator collectible using Spore/DOB: create, display, transfer, and verify provenance without pretending off-chain metadata is on-chain proof.",
    deliverables: ["digital-object state model", "create/transfer/read workflow", "on-chain vs off-chain provenance boundary", "wallet/indexer integration map", "MVP and failure-case tests"],
    workflow: ["Define content and provenance claims", "Map object ownership/state to Cells", "Design create and transfer lifecycle", "Plan discovery/rendering/indexing", "Test tamper, missing metadata, and transfer cases"],
    evidenceRules: "Separate CKB-verifiable state from external content availability and application metadata. Prefer current maintained Spore guidance."
  },
  {
    id: "rgbpp-integration-review",
    title: "RGB++ Integration Review",
    audience: "Bitcoin-linked asset teams, wallets, cross-chain product builders",
    description: "Review a Bitcoin/CKB linked-asset design and identify which claims belong to Bitcoin, CKB, RGB++ synchronization, application indexing, and user wallet confirmation.",
    agent: "ckb-security-reviewer",
    plugins: ["ckb-docs", "ckb-community"],
    requires: [],
    example: "Review my RGB++ product design and tell me which state transitions are actually verifiable on Bitcoin or CKB, what synchronization assumptions exist, and what the wallet must show users.",
    deliverables: ["cross-chain trust/state map", "Bitcoin-vs-CKB evidence boundary", "synchronization assumptions", "wallet/user confirmation requirements", "failure and recovery test matrix"],
    workflow: ["Define assets and chain-of-record claims", "Map Bitcoin and CKB state responsibilities", "Identify synchronization/indexing dependencies", "Review user signing/confirmation boundaries", "Exercise reorg, delay, mismatch, and recovery scenarios"],
    evidenceRules: "Do not describe application indexing or bridge-like synchronization as consensus proof. Flag version-sensitive RGB++ behavior for current-source verification."
  },
  {
    id: "credential-trust-audit",
    title: "CKBuilder Credential Trust Audit",
    audience: "credential issuers, reviewers, verifier operators, education/community programs",
    description: "Audit a credential lifecycle from evidence submission through human review, signature verification, issuer binding, on-chain record inspection, revocation, and public passport presentation.",
    agent: "ckbuilder-credential-reviewer",
    plugins: ["ckb-docs", "ckb-rpc"],
    requires: [],
    example: "Audit my CKBuilder credential deployment before public launch. Check what proves issuance, what proves revocation, what the verifier trusts, and where a human decision remains authoritative.",
    deliverables: ["credential trust-boundary map", "issuance and revocation authority checks", "off-chain/on-chain verification matrix", "privacy and evidence exposure review", "end-to-end lifecycle test plan"],
    workflow: ["Map issuer, reviewer, holder, verifier authorities", "Trace evidence-to-credential issuance", "Verify signature/issuer/record checks", "Trace revocation and stale-proof behavior", "Test privacy, tamper, duplicate, and offline states"],
    evidenceRules: "AI cannot approve issuance or override deterministic signature/revocation results. Treat human review and cryptographic/on-chain verification as separate authorities."
  },
  {
    id: "rpc-incident-response",
    title: "CKB RPC Incident Response",
    audience: "operators, backend teams, wallets, indexer-dependent applications",
    description: "Handle a production-style CKB RPC incident using a bounded evidence workflow: scope impact, compare node/indexer facts, identify stale or partial data, isolate application assumptions, and define recovery checks.",
    agent: "ckb-rpc-debugger",
    plugins: ["ckb-rpc", "ckb-docs"],
    requires: ["CKB_RPC_URL"],
    example: "My app suddenly reports Cells as missing and transactions as unknown. Triage whether the RPC/indexer is stale, the network is wrong, or my application cache is inconsistent.",
    deliverables: ["incident scope and severity", "live RPC evidence summary", "network/sync/indexer hypothesis ranking", "safe mitigation actions", "recovery verification checklist"],
    workflow: ["Confirm network and symptom scope", "Collect node/RPC/indexer evidence", "Differentiate upstream vs application failures", "Choose non-destructive mitigation", "Verify recovery with repeatable checks"],
    evidenceRules: "Never call a node healthy from one successful request. Prefer multiple read-only observations and preserve uncertainty when indexer/node state cannot be compared."
  },
  {
    id: "fiber-liquidity-planning",
    title: "Fiber Liquidity & Routing Planner",
    audience: "Fiber operators, payment apps, agent-commerce services",
    description: "Use read-only Fiber evidence to plan routing and liquidity improvements without autonomously opening channels or sending funds.",
    agent: "ckb-rpc-debugger",
    plugins: ["fiber-rpc", "ckb-docs"],
    requires: ["FIBER_RPC_URL"],
    example: "Payments succeed only for small amounts. Review my Fiber node/channel evidence and propose a liquidity/routing test plan without moving funds automatically.",
    deliverables: ["node/channel/liquidity snapshot", "routing bottleneck hypotheses", "payment-size test matrix", "human-approved channel/liquidity actions", "post-change verification plan"],
    workflow: ["Collect node, peer, channel, graph evidence", "Segment failures by amount/path", "Rank liquidity vs connectivity causes", "Propose human-approved adjustments", "Verify with read-only status and dry-run evidence"],
    evidenceRules: "Never open or close channels or execute a payment. Any funding/liquidity action must remain an explicit human-controlled step."
  }
];

function clean(value, name, max) {
  const text = String(value ?? "").trim();
  if (!text) throw new AppError("CKB_APPLICATION_INPUT_REQUIRED", `${name} is required.`);
  if (text.length > max) throw new AppError("CKB_APPLICATION_INPUT_TOO_LONG", `${name} must be at most ${max} characters.`);
  return text;
}


function workflowFor(app) {
  const steps = Array.isArray(app.workflow) && app.workflow.length
    ? app.workflow
    : ["Scope the objective", "Collect configured evidence", "Analyze evidence and gaps", "Produce actionable deliverables"];
  return steps.map((step, index) => ({ id: `stage-${index + 1}`, order: index + 1, title: String(step) }));
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
    workflow: workflowFor(app),
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

WORKFLOW STAGES
${workflowFor(app).map((stage) => `${stage.order}. ${stage.title}`).join("\n")}

REQUIRED DELIVERABLES
${app.deliverables.map((item, index) => `${index + 1}. ${item}`).join("\n")}

EVIDENCE RULES
${app.evidenceRules}

If required runtime configuration is missing, continue with the evidence that is available, clearly name the missing configuration, and give the smallest safe step needed to enable live evidence. Do not pretend a live check ran when it did not.`;
  return {
    application: { id: app.id, title: app.title, audience: app.audience, deliverables: [...app.deliverables], workflow: workflowFor(app), ...runtimeStatus },
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
