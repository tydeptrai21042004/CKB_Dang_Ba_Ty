import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AppError } from "./errors.js";
import { callMcpTool, listMcpTools, validateMcpEndpoint } from "./mcp-client.js";

const OFFICIAL_DOCS = "https://docs.nervos.org";
const COMMUNITY_FORUM = "https://talk.nervos.org";
const GITHUB_API = "https://api.github.com";


function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
export function agentToolApprovalFingerprint(tool, args = {}) {
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(stable({ tool: String(tool), arguments: args ?? {} }))).digest("hex")}`;
}

const CKB_REPOS = Object.freeze({
  ckb: "nervosnetwork/ckb",
  fiber: "nervosnetwork/fiber",
  ccc: "ckb-devrel/ccc",
  "spore-sdk": "sporeprotocol/spore-sdk",
  "spore-contract": "sporeprotocol/spore-contract",
  "ckb-testtool": "nervosnetwork/ckb-testtool",
  "ckb-cli": "nervosnetwork/ckb-cli"
});

const BUILTIN_PLUGINS = [
  {
    id: "ckb-docs", name: "Official CKB Docs", source: "CKB DevRel", trust: "official", transport: "builtin",
    description: "Search the current official CKB LLM documentation corpus for version-sensitive development and protocol guidance.", permissions: ["internet:read"], enabledByDefault: true
  },
  {
    id: "ckb-community", name: "Nervos Community", source: "Nervos Talk / CKB DevRel", trust: "community", transport: "builtin",
    description: "Discover recent Nervos Talk topics and curated CKB developer/community resources.", permissions: ["internet:read"], enabledByDefault: true
  },
  {
    id: "ckb-github", name: "CKB Project Radar", source: "Public GitHub repositories", trust: "official-and-community", transport: "builtin",
    description: "Read current issues, releases, and repository activity from an allowlist of core CKB, Fiber, CCC, and Spore projects.", permissions: ["internet:read"], enabledByDefault: false
  },
  {
    id: "ckb-rpc", name: "CKB JSON-RPC & Indexer", source: "CKBuilder", trust: "local-config", transport: "builtin",
    description: "Read chain state, Cells, transaction status, and dry-run evidence from the deployment-configured CKB JSON-RPC endpoint. No broadcast methods are exposed.", permissions: ["ckb:rpc:read"], enabledByDefault: false, requiresConfig: "CKB_RPC_URL"
  },
  {
    id: "fiber-rpc", name: "Fiber Node Operations", source: "CKBuilder / FNN RPC", trust: "local-config", transport: "builtin",
    description: "Read Fiber node, peer, channel, payment, and network-graph state for operator diagnostics. Mutating Fiber RPC methods are never exposed.", permissions: ["fiber:rpc:read"], enabledByDefault: false, requiresConfig: "FIBER_RPC_URL"
  },
  {
    id: "ckb-workspace", name: "CKB Developer Workspace", source: "Local configured workspace", trust: "local-config", transport: "builtin",
    description: "Read and search source code in an explicitly configured CKB project workspace. Secret files and arbitrary command execution are blocked.", permissions: ["filesystem:read"], enabledByDefault: false, requiresConfig: "CKB_AGENT_WORKSPACE"
  },
  {
    id: "ckb-ai-mcp", name: "CKB AI MCP", source: "CKB community", trust: "community-alpha", transport: "mcp",
    description: "Community-built CKB AI MCP tools for docs, RPC, development, debugging, and workflow guidance.", permissions: ["mcp:remote", "internet:read"], enabledByDefault: false,
    endpoint: "https://mcp.ckbdev.com/ckbai"
  }
];

function cleanId(value) {
  const id = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(id)) throw new AppError("PLUGIN_ID_INVALID", "Plugin id must use lowercase letters, numbers, dots, underscores, or hyphens.");
  return id;
}

function fetchTimeout(fetchImpl, url, options = {}, timeoutMs = 12000) {
  return fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
}

function boundedJson(value, max = 16000) {
  let text;
  try { text = JSON.stringify(value, null, 2); } catch { text = String(value ?? ""); }
  if (text.length <= max) return value;
  return { truncated: true, text: text.slice(0, max) };
}

function searchText(text, query, maxMatches = 8) {
  const lines = String(text ?? "").split(/\r?\n/);
  const terms = String(query ?? "").toLowerCase().split(/\s+/).filter((x) => x.length > 2).slice(0, 10);
  if (!terms.length) return lines.slice(0, 80).join("\n");
  const matches = [];
  for (let i = 0; i < lines.length && matches.length < maxMatches; i += 1) {
    const low = lines[i].toLowerCase();
    if (!terms.some((term) => low.includes(term))) continue;
    const start = Math.max(0, i - 2); const end = Math.min(lines.length, i + 5);
    matches.push(lines.slice(start, end).join("\n"));
  }
  return matches.join("\n\n---\n\n").slice(0, 18000);
}

function validateHttpRpcUrl(value, code, label) {
  let url;
  try { url = new URL(String(value ?? "")); } catch { throw new AppError(code, `${label} URL is invalid.`); }
  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) throw new AppError(code, `${label} URL must be HTTP(S) without embedded credentials.`);
  return url.toString();
}

function validateRpcUrl(value) { return validateHttpRpcUrl(value, "CKB_RPC_URL_INVALID", "CKB agent RPC"); }
function validateFiberRpcUrl(value) { return validateHttpRpcUrl(value, "FIBER_RPC_URL_INVALID", "Fiber agent RPC"); }

async function rpcCall(runtime, url, method, params, errorPrefix) {
  const response = await fetchTimeout(runtime.fetchImpl, url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  }, runtime.timeoutMs);
  if (!response.ok) throw new AppError(`${errorPrefix}_HTTP_ERROR`, `${errorPrefix.replaceAll("_", " ")} returned HTTP ${response.status}.`);
  const body = await response.json().catch(() => null);
  if (!body || body.error) throw new AppError(`${errorPrefix}_ERROR`, String(body?.error?.message ?? `${errorPrefix.replaceAll("_", " ")} returned an invalid response.`));
  return boundedJson(body.result);
}

async function ckbRpc(runtime, method, params = []) {
  const rpcUrl = runtime.rpcUrl ? validateRpcUrl(runtime.rpcUrl) : null;
  if (!rpcUrl) throw new AppError("CKB_RPC_NOT_CONFIGURED", "This deployment has not configured CKB_RPC_URL for the agent.");
  const allowed = new Set([
    "get_tip_block_number", "get_tip_header", "get_blockchain_info", "get_transaction", "get_live_cell", "get_block_by_number", "get_fee_rate_statistics",
    "get_cells", "get_cells_capacity", "get_transactions", "get_indexer_tip", "dry_run_transaction", "get_consensus", "tx_pool_info"
  ]);
  if (!allowed.has(method)) throw new AppError("CKB_RPC_METHOD_BLOCKED", "The AI agent may only use the shipped read-only CKB RPC allowlist.");
  return rpcCall(runtime, rpcUrl, method, params, "CKB_RPC");
}

async function fiberRpc(runtime, method, params = []) {
  const rpcUrl = runtime.fiberRpcUrl ? validateFiberRpcUrl(runtime.fiberRpcUrl) : null;
  if (!rpcUrl) throw new AppError("FIBER_RPC_NOT_CONFIGURED", "Set FIBER_RPC_URL to a trusted Fiber Node JSON-RPC endpoint to enable live operator diagnostics.");
  const allowed = new Set(["node_info", "list_peers", "list_channels", "list_payments", "get_payment", "graph_nodes", "graph_channels", "get_invoice", "parse_invoice", "get_cch_order"]);
  if (!allowed.has(method)) throw new AppError("FIBER_RPC_METHOD_BLOCKED", "CKBuilder only exposes read-only Fiber RPC methods to the AI agent.");
  return rpcCall(runtime, rpcUrl, method, params, "FIBER_RPC");
}

async function fiberPart(runtime, method, params = []) {
  try { return { ok: true, value: await fiberRpc(runtime, method, params) }; }
  catch (error) { return { ok: false, code: String(error?.code ?? "FIBER_RPC_ERROR"), message: String(error?.message ?? "Fiber RPC call failed.").slice(0, 500) }; }
}

function safeFiberHex(value, label, required = false) {
  const text = String(value ?? "").trim();
  if (!text && !required) return undefined;
  if (!/^0x[0-9a-fA-F]+$/.test(text) || text.length > 130) throw new AppError("FIBER_PAYMENT_QUOTE_INVALID", `${label} must be a bounded hexadecimal Fiber amount/value.`);
  return text;
}

export async function quoteFiberPayment(runtime, input = {}) {
  const rpcUrl = runtime.fiberRpcUrl ? validateFiberRpcUrl(runtime.fiberRpcUrl) : null;
  if (!rpcUrl) throw new AppError("FIBER_RPC_NOT_CONFIGURED", "Set FIBER_RPC_URL to a trusted Fiber Node JSON-RPC endpoint to request a dry-run quote.");
  const invoice = String(input.invoice ?? "").trim();
  const targetPubkey = String(input.targetPubkey ?? input.target_pubkey ?? "").trim();
  const amount = safeFiberHex(input.amount, "amount", Boolean(targetPubkey));
  if (!invoice && !targetPubkey) throw new AppError("FIBER_PAYMENT_QUOTE_INVALID", "Provide either a Fiber invoice or targetPubkey + amount for a dry-run quote.");
  if (invoice && invoice.length > 8192) throw new AppError("FIBER_PAYMENT_QUOTE_INVALID", "Fiber invoice is too long.");
  if (targetPubkey && !/^(?:0x)?[0-9a-fA-F]{66}$/.test(targetPubkey)) throw new AppError("FIBER_PAYMENT_QUOTE_INVALID", "targetPubkey must be a compressed secp256k1 public key.");
  const maxFeeAmount = safeFiberHex(input.maxFeeAmount ?? input.max_fee_amount, "maxFeeAmount");
  const payload = invoice ? { invoice } : { target_pubkey: targetPubkey.replace(/^0x/, ""), amount, keysend: true };
  if (maxFeeAmount) payload.max_fee_amount = maxFeeAmount;
  payload.dry_run = true;
  // Important: send_payment is reachable only through this wrapper, which always forces dry_run=true.
  const result = await rpcCall(runtime, rpcUrl, "send_payment", [payload], "FIBER_RPC");
  return { request: payload, result };
}

export async function verifyFiberPayment(runtime, input = {}) {
  const paymentHash = String(input.paymentHash ?? input.payment_hash ?? "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(paymentHash)) throw new AppError("FIBER_PAYMENT_STATUS_INVALID", "paymentHash must be a 32-byte hexadecimal Fiber payment hash.");
  const result = await fiberRpc(runtime, "get_payment", [paymentHash]);
  const status = String(result?.status ?? result?.payment_status ?? result?.state ?? "unknown").toLowerCase();
  const settled = new Set(["success", "succeeded", "completed", "settled"]).has(status);
  return { schema: "ckbuilder-fiber-payment-verification/v1", paymentHash, settled, status, result, evidenceSource: "fiber-rpc:get_payment" };
}

function githubHeaders(runtime) {
  return {
    accept: "application/vnd.github+json",
    "user-agent": "ckbuilder-community-agent/10.0",
    "x-github-api-version": "2022-11-28",
    ...(runtime.githubToken ? { authorization: `Bearer ${runtime.githubToken}` } : {})
  };
}

async function githubJson(runtime, route) {
  const response = await fetchTimeout(runtime.fetchImpl, `${GITHUB_API}${route}`, { headers: githubHeaders(runtime) }, runtime.timeoutMs);
  if (!response.ok) {
    const remaining = response.headers?.get?.("x-ratelimit-remaining");
    const suffix = response.status === 403 && remaining === "0" ? " GitHub public API rate limit is exhausted; configure CKB_GITHUB_TOKEN for higher limits." : "";
    throw new AppError("CKB_GITHUB_HTTP_ERROR", `GitHub returned HTTP ${response.status}.${suffix}`);
  }
  return response.json().catch(() => { throw new AppError("CKB_GITHUB_RESPONSE_INVALID", "GitHub returned invalid JSON."); });
}

function normalizeScript(value) {
  if (!value || typeof value !== "object") throw new AppError("CKB_SCRIPT_INVALID", "script must be an object.");
  const codeHash = String(value.code_hash ?? value.codeHash ?? "");
  const hashType = String(value.hash_type ?? value.hashType ?? "");
  const args = String(value.args ?? "");
  if (!/^0x[0-9a-fA-F]{64}$/.test(codeHash) || !new Set(["data", "type", "data1", "data2"]).has(hashType) || !/^0x[0-9a-fA-F]*$/.test(args)) throw new AppError("CKB_SCRIPT_INVALID", "script requires code_hash, hash_type, and hexadecimal args.");
  return { code_hash: codeHash, hash_type: hashType, args };
}

function workspaceRoot(runtime) {
  if (!runtime.workspaceDir) throw new AppError("CKB_WORKSPACE_NOT_CONFIGURED", "Set CKB_AGENT_WORKSPACE to an explicitly approved CKB project directory to enable source inspection.");
  const root = path.resolve(String(runtime.workspaceDir));
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new AppError("CKB_WORKSPACE_INVALID", "CKB_AGENT_WORKSPACE does not point to a readable directory.");
  return root;
}

const BLOCKED_DIRS = new Set([".git", "node_modules", "target", "dist", "build", ".next", "coverage", "data", "secrets", ".ssh"]);
const BLOCKED_FILE = /(?:^|\/)(?:\.env(?:\..*)?|.*(?:private[-_]?key|secret|seed|mnemonic|keystore).*|id_rsa|id_ed25519|.*\.(?:pem|key|p12|pfx))$/i;
const TEXT_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".rs", ".c", ".h", ".toml", ".json", ".md", ".yml", ".yaml", ".txt", ".sh", ".lock", ".proto", ".mol"]);

function walkWorkspace(root, maxFiles = 500) {
  const files = [];
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length && files.length < maxFiles) {
    const { dir, depth } = stack.pop();
    if (depth > 8) continue;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (files.length >= maxFiles) break;
      const full = path.join(dir, entry.name); const rel = path.relative(root, full).replaceAll(path.sep, "/");
      if (entry.isDirectory()) { if (!BLOCKED_DIRS.has(entry.name) && !entry.name.startsWith(".")) stack.push({ dir: full, depth: depth + 1 }); continue; }
      if (!entry.isFile() || BLOCKED_FILE.test(rel)) continue;
      if (TEXT_EXT.has(path.extname(entry.name).toLowerCase()) || ["Makefile", "Dockerfile", "AGENTS.md"].includes(entry.name)) files.push(rel);
    }
  }
  return files.sort();
}

function safeWorkspaceFile(root, relative) {
  const rel = String(relative ?? "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!rel || rel.includes("..") || BLOCKED_FILE.test(rel)) throw new AppError("CKB_WORKSPACE_FILE_BLOCKED", "That workspace path is invalid or secret-sensitive.");
  const full = path.resolve(root, rel);
  if (full !== root && !full.startsWith(`${root}${path.sep}`)) throw new AppError("CKB_WORKSPACE_FILE_BLOCKED", "Workspace reads cannot escape CKB_AGENT_WORKSPACE.");
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) throw new AppError("CKB_WORKSPACE_FILE_NOT_FOUND", "Workspace file was not found.");
  if (fs.statSync(full).size > 256 * 1024) throw new AppError("CKB_WORKSPACE_FILE_TOO_LARGE", "Workspace file is too large for agent inspection.");
  return full;
}

function readWorkspaceText(root, relative, max = 50000) {
  return fs.readFileSync(safeWorkspaceFile(root, relative), "utf8").slice(0, max);
}

function builtinTools(pluginId, runtime) {
  if (pluginId === "ckb-docs") return [
    {
      name: "ckb_docs_search", description: "Search the concise current official CKB documentation map (llms.txt). Use for version-sensitive CKB development questions and to locate authoritative pages.",
      inputSchema: { type: "object", properties: { query: { type: "string", description: "CKB concept, API, tool, protocol, or workflow" } }, required: ["query"], additionalProperties: false },
      execute: async ({ query }) => {
        const response = await fetchTimeout(runtime.fetchImpl, `${OFFICIAL_DOCS}/llms.txt`, { headers: { accept: "text/plain" } }, runtime.timeoutMs);
        if (!response.ok) throw new AppError("PLUGIN_HTTP_ERROR", `Official CKB docs returned HTTP ${response.status}.`);
        return { source: `${OFFICIAL_DOCS}/llms.txt`, matches: searchText(await response.text(), query, 10) };
      }
    },
    {
      name: "ckb_docs_deep_search", description: "Search the full official CKB LLM documentation corpus (llms-full.txt) for detailed APIs, Script testing/debugging, CCC, Fiber, xUDT, Spore, or RGB++ guidance.",
      inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false },
      execute: async ({ query }) => {
        const response = await fetchTimeout(runtime.fetchImpl, `${OFFICIAL_DOCS}/llms-full.txt`, { headers: { accept: "text/plain" } }, Math.max(runtime.timeoutMs, 20000));
        if (!response.ok) throw new AppError("PLUGIN_HTTP_ERROR", `Official CKB full docs returned HTTP ${response.status}.`);
        return { source: `${OFFICIAL_DOCS}/llms-full.txt`, matches: searchText(await response.text(), query, 14) };
      }
    },
    {
      name: "ckb_dev_skills", description: "Read the official CKB AI Resources / CKB Dev Skills guidance for choosing current agent workflows across dApps, Scripts, Cells, transactions, testing, debugging, and deployment.",
      inputSchema: { type: "object", properties: { query: { type: "string" } }, additionalProperties: false },
      execute: async ({ query = "CKB Dev Skills agent workflow" }) => {
        const source = `${OFFICIAL_DOCS}/docs/ai-agents/ai-resource`;
        const response = await fetchTimeout(runtime.fetchImpl, source, { headers: { accept: "text/html" } }, runtime.timeoutMs);
        if (!response.ok) throw new AppError("PLUGIN_HTTP_ERROR", `Official CKB AI Resources returned HTTP ${response.status}.`);
        return { source, matches: searchText(await response.text(), query, 12), freshness: "live official docs" };
      }
    }
  ];

  if (pluginId === "ckb-community") return [
    {
      name: "ckb_community_latest", description: "Read recent public Nervos Talk topics. Use when the user asks what the CKB community is discussing, building, funding, troubleshooting, or announcing.",
      inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 20 }, query: { type: "string" } }, additionalProperties: false },
      execute: async ({ limit = 8, query = "" }) => {
        const response = await fetchTimeout(runtime.fetchImpl, `${COMMUNITY_FORUM}/latest.json`, { headers: { accept: "application/json" } }, runtime.timeoutMs);
        if (!response.ok) throw new AppError("PLUGIN_HTTP_ERROR", `Nervos Talk returned HTTP ${response.status}.`);
        const body = await response.json(); const terms = String(query).toLowerCase().trim().split(/\s+/).filter(Boolean);
        const topics = (body?.topic_list?.topics ?? []).filter((t) => !terms.length || terms.some((term) => String(t.title ?? "").toLowerCase().includes(term))).slice(0, Math.max(1, Math.min(20, Number(limit) || 8))).map((t) => ({ id: t.id, title: t.title, slug: t.slug, postsCount: t.posts_count, views: t.views, lastPostedAt: t.last_posted_at, url: `${COMMUNITY_FORUM}/t/${t.slug}/${t.id}` }));
        return { source: `${COMMUNITY_FORUM}/latest`, topics };
      }
    },
    {
      name: "ckb_community_resources", description: "Return trusted starting points for the current CKB developer and community ecosystem.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: async () => ({ resources: [
        { name: "Official CKB docs", url: "https://docs.nervos.org/", type: "docs" },
        { name: "Official CKB AI resources", url: "https://docs.nervos.org/docs/ai-agents/ai-resource", type: "ai" },
        { name: "CKB DevRel", url: "https://github.com/ckb-devrel", type: "development" },
        { name: "CCC", url: "https://github.com/ckb-devrel/ccc", type: "sdk" },
        { name: "Fiber", url: "https://github.com/nervosnetwork/fiber", type: "payments" },
        { name: "Spore", url: "https://github.com/sporeprotocol", type: "digital-objects" },
        { name: "Nervos Talk", url: "https://talk.nervos.org/", type: "community" }
      ] })
    }
  ];

  if (pluginId === "ckb-github") return [
    {
      name: "ckb_project_map", description: "List the allowlisted CKB repositories that this project-radar plugin can inspect.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: async () => ({ projects: Object.entries(CKB_REPOS).map(([id, repo]) => ({ id, repo, url: `https://github.com/${repo}` })) })
    },
    {
      name: "ckb_open_issues", description: "Find current open issues in a core CKB/Fiber/CCC/Spore repository. Useful for contribution discovery and checking whether a problem is already known.",
      inputSchema: { type: "object", properties: { project: { type: "string", enum: Object.keys(CKB_REPOS) }, query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 30 } }, required: ["project"], additionalProperties: false },
      execute: async ({ project, query = "", limit = 12 }) => {
        const repo = CKB_REPOS[String(project)]; if (!repo) throw new AppError("CKB_GITHUB_PROJECT_INVALID", "Unknown allowlisted CKB project.");
        const perPage = Math.max(10, Math.min(50, Number(limit) * 3));
        const items = await githubJson(runtime, `/repos/${repo}/issues?state=open&sort=updated&direction=desc&per_page=${perPage}`);
        const terms = String(query).toLowerCase().split(/\s+/).filter((x) => x.length > 1);
        const filtered = (Array.isArray(items) ? items : []).filter((item) => !item.pull_request).filter((item) => {
          if (!terms.length) return true;
          const haystack = `${item.title ?? ""}\n${item.body ?? ""}\n${(item.labels ?? []).map((l) => l.name).join(" ")}`.toLowerCase();
          return terms.some((term) => haystack.includes(term));
        }).slice(0, Math.max(1, Math.min(30, Number(limit) || 12))).map((item) => ({ number: item.number, title: item.title, url: item.html_url, labels: (item.labels ?? []).map((l) => l.name), comments: item.comments, createdAt: item.created_at, updatedAt: item.updated_at, author: item.user?.login }));
        return { repository: repo, issues: filtered };
      }
    },
    {
      name: "ckb_project_activity", description: "Read recent public releases and commits for an allowlisted CKB ecosystem repository.",
      inputSchema: { type: "object", properties: { project: { type: "string", enum: Object.keys(CKB_REPOS) } }, required: ["project"], additionalProperties: false },
      execute: async ({ project }) => {
        const repo = CKB_REPOS[String(project)]; if (!repo) throw new AppError("CKB_GITHUB_PROJECT_INVALID", "Unknown allowlisted CKB project.");
        const [releases, commits] = await Promise.all([
          githubJson(runtime, `/repos/${repo}/releases?per_page=5`).catch(() => []),
          githubJson(runtime, `/repos/${repo}/commits?per_page=8`).catch(() => [])
        ]);
        return { repository: repo, releases: (Array.isArray(releases) ? releases : []).map((r) => ({ tag: r.tag_name, name: r.name, publishedAt: r.published_at, prerelease: r.prerelease, url: r.html_url })), commits: (Array.isArray(commits) ? commits : []).map((c) => ({ sha: String(c.sha ?? "").slice(0, 12), message: String(c.commit?.message ?? "").split("\n")[0].slice(0, 240), date: c.commit?.author?.date, url: c.html_url })) };
      }
    }
  ];

  if (pluginId === "ckb-rpc") return [
    { name: "ckb_rpc_tip", description: "Get the current tip block number and tip header from the configured CKB node.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async () => ({ blockNumber: await ckbRpc(runtime, "get_tip_block_number", []), header: await ckbRpc(runtime, "get_tip_header", []) }) },
    { name: "ckb_rpc_blockchain_info", description: "Get read-only blockchain/node information from the configured CKB node.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async () => ckbRpc(runtime, "get_blockchain_info", []) },
    { name: "ckb_rpc_transaction", description: "Read a transaction by hash from the configured CKB node.", inputSchema: { type: "object", properties: { txHash: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" } }, required: ["txHash"], additionalProperties: false }, execute: async ({ txHash }) => ckbRpc(runtime, "get_transaction", [String(txHash)]) },
    { name: "ckb_rpc_live_cell", description: "Read a live Cell by out point from the configured CKB node.", inputSchema: { type: "object", properties: { txHash: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" }, index: { type: "string", pattern: "^0x[0-9a-fA-F]+$" }, withData: { type: "boolean" } }, required: ["txHash", "index"], additionalProperties: false }, execute: async ({ txHash, index, withData = true }) => ckbRpc(runtime, "get_live_cell", [{ tx_hash: String(txHash), index: String(index) }, Boolean(withData)]) },
    { name: "ckb_rpc_dry_run_transaction", description: "Dry-run a raw CKB transaction without broadcasting it to obtain Script execution/cycle evidence. This never submits the transaction.", inputSchema: { type: "object", properties: { transaction: { type: "object" } }, required: ["transaction"], additionalProperties: false }, execute: async ({ transaction }) => ckbRpc(runtime, "dry_run_transaction", [transaction]) },
    { name: "ckb_rpc_cells_by_script", description: "Use the CKB indexer RPC to list live Cells by an exact lock or type Script.", inputSchema: { type: "object", properties: { script: { type: "object" }, scriptType: { type: "string", enum: ["lock", "type"] }, limit: { type: "integer", minimum: 1, maximum: 100 }, withData: { type: "boolean" } }, required: ["script", "scriptType"], additionalProperties: false }, execute: async ({ script, scriptType, limit = 20, withData = true }) => ckbRpc(runtime, "get_cells", [{ script: normalizeScript(script), script_type: scriptType, script_search_mode: "exact", with_data: Boolean(withData) }, "desc", `0x${Math.max(1, Math.min(100, Number(limit) || 20)).toString(16)}`]) },
    { name: "ckb_rpc_cells_capacity", description: "Use the CKB indexer RPC to total live Cell capacity controlled by an exact lock or type Script.", inputSchema: { type: "object", properties: { script: { type: "object" }, scriptType: { type: "string", enum: ["lock", "type"] } }, required: ["script", "scriptType"], additionalProperties: false }, execute: async ({ script, scriptType }) => ckbRpc(runtime, "get_cells_capacity", [{ script: normalizeScript(script), script_type: scriptType, script_search_mode: "exact" }]) }
  ];

  if (pluginId === "fiber-rpc") return [
    {
      name: "fiber_health_snapshot", description: "Collect a read-only Fiber operator snapshot: node info, connected peers, channels, recent payments, and a small graph sample. Returns partial evidence if a version-specific method is unavailable.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: async () => ({
        node: await fiberPart(runtime, "node_info", []),
        peers: await fiberPart(runtime, "list_peers", []),
        channels: await fiberPart(runtime, "list_channels", []),
        payments: await fiberPart(runtime, "list_payments", []),
        graphNodes: await fiberPart(runtime, "graph_nodes", []),
        graphChannels: await fiberPart(runtime, "graph_channels", []),
        note: "Fiber RPC APIs are actively evolving; treat method-level failures as compatibility evidence rather than inventing data."
      })
    },
    { name: "fiber_node_info", description: "Read Fiber node version, identity, addresses, features, channel counters, and channel policy defaults.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async () => fiberRpc(runtime, "node_info", []) },
    { name: "fiber_list_peers", description: "List currently connected Fiber peers.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async () => fiberRpc(runtime, "list_peers", []) },
    { name: "fiber_list_channels", description: "List Fiber channels, optionally including closed or only pending channel attempts.", inputSchema: { type: "object", properties: { includeClosed: { type: "boolean" }, onlyPending: { type: "boolean" } }, additionalProperties: false }, execute: async ({ includeClosed = false, onlyPending = false }) => fiberRpc(runtime, "list_channels", (includeClosed || onlyPending) ? [{ include_closed: Boolean(includeClosed), only_pending: Boolean(onlyPending) }] : []) },
    { name: "fiber_list_payments", description: "List recent Fiber payments, optionally filtered by payment status.", inputSchema: { type: "object", properties: { status: { type: "string", maxLength: 40 } }, additionalProperties: false }, execute: async ({ status }) => fiberRpc(runtime, "list_payments", status ? [{ status: String(status) }] : []) },
    { name: "fiber_payment_quote", description: "Simulate a Fiber payment with send_payment dry_run=true. Returns route/fee feasibility evidence only and can never execute a real payment.", inputSchema: { type: "object", properties: { invoice: { type: "string", maxLength: 8192 }, targetPubkey: { type: "string", maxLength: 68 }, amount: { type: "string", maxLength: 130 }, maxFeeAmount: { type: "string", maxLength: 130 } }, additionalProperties: false }, execute: async (args) => quoteFiberPayment(runtime, args) },
    { name: "fiber_graph_overview", description: "Read Fiber network graph nodes and channels visible to this node.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async () => ({ nodes: await fiberRpc(runtime, "graph_nodes", []), channels: await fiberRpc(runtime, "graph_channels", []) }) }
  ];

  if (pluginId === "ckb-workspace") return [
    {
      name: "ckb_workspace_summary", description: "List relevant source/config/test files in the explicitly configured CKB project workspace, excluding dependencies, build output, data, and secrets.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: async () => { const root = workspaceRoot(runtime); const files = walkWorkspace(root, 400); return { workspaceName: path.basename(root), fileCount: files.length, files: files.slice(0, 260), detected: { cargo: files.includes("Cargo.toml"), node: files.includes("package.json"), make: files.includes("Makefile"), agentInstructions: files.includes("AGENTS.md") } }; }
    },
    {
      name: "ckb_workspace_search", description: "Search text/code inside the configured CKB workspace. Secret-sensitive files, dependencies, target/build output, and data directories are excluded.",
      inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 30 } }, required: ["query"], additionalProperties: false },
      execute: async ({ query, limit = 12 }) => {
        const root = workspaceRoot(runtime); const files = walkWorkspace(root, 500); const terms = String(query).toLowerCase().split(/\s+/).filter((x) => x.length > 1).slice(0, 8); const matches = [];
        for (const rel of files) {
          if (matches.length >= Math.max(1, Math.min(30, Number(limit) || 12))) break;
          let text = ""; try { text = readWorkspaceText(root, rel, 100000); } catch { continue; }
          const lines = text.split(/\r?\n/); for (let i = 0; i < lines.length; i += 1) { const low = lines[i].toLowerCase(); if (terms.some((term) => low.includes(term))) { matches.push({ file: rel, line: i + 1, excerpt: lines.slice(Math.max(0, i - 2), i + 3).join("\n").slice(0, 1800) }); break; } }
        }
        return { query: String(query).slice(0, 300), matches };
      }
    },
    {
      name: "ckb_workspace_read_file", description: "Read one non-secret source/config/test file from the configured CKB workspace.",
      inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
      execute: async ({ path: relative }) => { const root = workspaceRoot(runtime); return { path: String(relative), content: readWorkspaceText(root, relative, 50000) }; }
    }
  ];

  return [];
}

function safeFunctionName(pluginId, toolName) {
  const base = `${pluginId}__${toolName}`.replace(/[^A-Za-z0-9_-]/g, "_");
  return base.slice(0, 64);
}

function manifestPlugin(value, fileName) {
  if (!value || typeof value !== "object") throw new AppError("PLUGIN_MANIFEST_INVALID", `Invalid plugin manifest: ${fileName}`);
  if (value.disabled === true) return null;
  const id = cleanId(value.id);
  if (value.transport !== "mcp") throw new AppError("PLUGIN_MANIFEST_INVALID", `Community manifest ${id} must use transport=mcp.`);
  return {
    id, name: String(value.name ?? id).slice(0, 120), source: String(value.source ?? "Community").slice(0, 120), trust: "community-unverified", transport: "mcp",
    description: String(value.description ?? "Community MCP plugin").slice(0, 500), permissions: ["mcp:remote", "internet:read"], enabledByDefault: false,
    endpoint: validateMcpEndpoint(value.endpoint)
  };
}

export function validateCommunityPluginManifest(value, fileName = "community.plugin.json") { return manifestPlugin(value, fileName); }

export function loadCommunityPluginManifests(rootDir) {
  const dir = path.join(rootDir, "plugins", "community");
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const name of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort().slice(0, 64)) {
    try { const plugin = manifestPlugin(JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")), name); if (plugin) result.push(plugin); } catch {}
  }
  return result;
}

export function aiPluginCatalog(rootDir) {
  const community = rootDir ? loadCommunityPluginManifests(rootDir) : [];
  const seen = new Set();
  return [...BUILTIN_PLUGINS, ...community].filter((p) => !seen.has(p.id) && seen.add(p.id)).map(({ endpoint, ...plugin }) => ({ ...plugin, ...(endpoint ? { endpoint } : {}) }));
}

export async function resolveAgentTools(pluginIds, runtime = {}) {
  const rootDir = runtime.rootDir ?? process.cwd(); const catalog = aiPluginCatalog(rootDir); const byId = new Map(catalog.map((p) => [p.id, p]));
  const requested = Array.isArray(pluginIds) && pluginIds.length ? pluginIds : catalog.filter((p) => p.enabledByDefault).map((p) => p.id);
  const ids = [...new Set(requested.map(cleanId))].slice(0, 8); const tools = []; const plugins = []; const execByName = new Map();
  const baseRuntime = { fetchImpl: runtime.fetchImpl ?? fetch, timeoutMs: runtime.timeoutMs ?? 12000, rpcUrl: runtime.rpcUrl, fiberRpcUrl: runtime.fiberRpcUrl, workspaceDir: runtime.workspaceDir, githubToken: runtime.githubToken };

  for (const id of ids) {
    const plugin = byId.get(id); if (!plugin) throw new AppError("PLUGIN_NOT_FOUND", `Unknown AI plugin: ${id}`);
    const entry = { id: plugin.id, name: plugin.name, trust: plugin.trust, permissions: plugin.permissions, transport: plugin.transport, status: "ready" };
    if (plugin.transport === "builtin") {
      const defs = builtinTools(id, baseRuntime);
      if (id === "ckb-rpc" && !baseRuntime.rpcUrl) entry.status = "configuration-required";
      if (id === "fiber-rpc" && !baseRuntime.fiberRpcUrl) entry.status = "configuration-required";
      if (id === "ckb-workspace" && !baseRuntime.workspaceDir) entry.status = "configuration-required";
      for (const def of defs) {
        const functionName = safeFunctionName(id, def.name); tools.push({ name: functionName, description: `[${plugin.name}] ${def.description}`, inputSchema: def.inputSchema, pluginId: id, risk: "read" }); execByName.set(functionName, async (args) => def.execute(args ?? {}));
      }
    } else if (plugin.transport === "mcp") {
      const discovery = await listMcpTools(plugin.endpoint, { fetchImpl: baseRuntime.fetchImpl, timeoutMs: baseRuntime.timeoutMs }); entry.transportMode = discovery.transport; entry.toolCount = discovery.tools.length;
      for (const remoteTool of discovery.tools.slice(0, 48)) {
        const functionName = safeFunctionName(id, remoteTool.name); const readOnlyHint = remoteTool.annotations?.readOnlyHint === true; const destructiveHint = remoteTool.annotations?.destructiveHint === true;
        const hardBlocked = /(?:send[_-]?transaction|broadcast|sign(?:er|ing|ature)?|private[_-]?key|seed|mnemonic|submit[_-]?transaction|open[_-]?channel|shutdown[_-]?channel|send[_-]?payment)/i.test(remoteTool.name);
        const risk = hardBlocked ? "blocked" : (readOnlyHint && !destructiveHint ? "read" : "external");
        tools.push({ name: functionName, description: `[${plugin.name} MCP] ${remoteTool.description || remoteTool.name}`, inputSchema: remoteTool.inputSchema, pluginId: id, remoteName: remoteTool.name, risk });
        execByName.set(functionName, async (args) => {
          if (risk === "blocked") throw new AppError("PLUGIN_TOOL_BLOCKED", `CKBuilder blocks MCP tool ${remoteTool.name} because signing, broadcasting, payments, channel mutation, or secret-handling operations are outside the AI boundary.`);
          const approved = new Set(Array.isArray(runtime.approvedTools) ? runtime.approvedTools.map(String) : []);
          const fingerprint = agentToolApprovalFingerprint(functionName, args ?? {});
          const exactOperations = Array.isArray(runtime.approvedOperations) ? runtime.approvedOperations : [];
          const exactApproval = exactOperations.some((item) => item && String(item.tool) === functionName && String(item.argumentsHash) === fingerprint);
          const legacyApproval = exactOperations.length === 0 && approved.has(functionName);
          if (risk !== "read" && !exactApproval && !legacyApproval) throw new AppError("PLUGIN_CONFIRMATION_REQUIRED", `MCP tool ${remoteTool.name} is not explicitly marked read-only and requires approval.`, { tool: functionName, argumentsHash: fingerprint });
          const called = await callMcpTool(plugin.endpoint, remoteTool.name, args ?? {}, { fetchImpl: baseRuntime.fetchImpl, timeoutMs: baseRuntime.timeoutMs }); return boundedJson(called.result);
        });
      }
    }
    plugins.push(entry);
  }
  return { tools: tools.slice(0, 96), plugins, execute: async (name, args) => { const fn = execByName.get(name); if (!fn) throw new AppError("AI_TOOL_NOT_FOUND", `AI requested unknown tool: ${name}`); return fn(args); } };
}

export function pluginManifestTemplate() {
  return { schemaVersion: 1, id: "community-example", name: "Community Example MCP", description: "Describe the real CKB workflow or data this plugin contributes.", source: "Your community/project name", transport: "mcp", endpoint: "https://example.org/mcp", disabled: true };
}
