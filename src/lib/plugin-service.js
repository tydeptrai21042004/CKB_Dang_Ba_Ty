import fs from "node:fs";
import path from "node:path";
import { AppError } from "./errors.js";
import { callMcpTool, listMcpTools, validateMcpEndpoint } from "./mcp-client.js";

const OFFICIAL_DOCS = "https://docs.nervos.org";
const COMMUNITY_FORUM = "https://talk.nervos.org";

const BUILTIN_PLUGINS = [
  {
    id: "ckb-docs", name: "Official CKB Docs", source: "CKB DevRel", trust: "official", transport: "builtin",
    description: "Search the official CKB LLM documentation map for current development guidance.", permissions: ["internet:read"], enabledByDefault: true
  },
  {
    id: "ckb-community", name: "Nervos Community", source: "Nervos Talk / CKB DevRel", trust: "community", transport: "builtin",
    description: "Discover current Nervos Talk topics and curated CKB developer/community resources.", permissions: ["internet:read"], enabledByDefault: true
  },
  {
    id: "ckb-rpc", name: "CKB JSON-RPC", source: "CKBuilder", trust: "local-config", transport: "builtin",
    description: "Read chain state from the deployment-configured CKB JSON-RPC endpoint. No transaction broadcast methods are exposed.", permissions: ["ckb:rpc:read"], enabledByDefault: false, requiresConfig: "CKB_RPC_URL"
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
  const terms = String(query ?? "").toLowerCase().split(/\s+/).filter((x) => x.length > 2).slice(0, 8);
  if (!terms.length) return lines.slice(0, 80).join("\n");
  const matches = [];
  for (let i = 0; i < lines.length && matches.length < maxMatches; i += 1) {
    const low = lines[i].toLowerCase();
    if (!terms.some((term) => low.includes(term))) continue;
    const start = Math.max(0, i - 2); const end = Math.min(lines.length, i + 4);
    matches.push(lines.slice(start, end).join("\n"));
  }
  return matches.join("\n\n---\n\n").slice(0, 16000);
}

function validateRpcUrl(value) {
  let url;
  try { url = new URL(String(value ?? "")); } catch { throw new AppError("CKB_RPC_URL_INVALID", "CKB agent RPC URL is invalid."); }
  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) throw new AppError("CKB_RPC_URL_INVALID", "CKB agent RPC URL must be an HTTP(S) URL without embedded credentials.");
  return url.toString();
}

async function ckbRpc(runtime, method, params = []) {
  const rpcUrl = runtime.rpcUrl ? validateRpcUrl(runtime.rpcUrl) : null;
  if (!rpcUrl) throw new AppError("CKB_RPC_NOT_CONFIGURED", "This deployment has not configured CKB_RPC_URL for the agent.");
  const allowed = new Set(["get_tip_block_number", "get_tip_header", "get_blockchain_info", "get_transaction", "get_live_cell", "get_block_by_number", "get_fee_rate_statistics"]);
  if (!allowed.has(method)) throw new AppError("CKB_RPC_METHOD_BLOCKED", "The AI agent may only use the shipped read-only CKB RPC allowlist.");
  const response = await fetchTimeout(runtime.fetchImpl, rpcUrl, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  }, runtime.timeoutMs);
  if (!response.ok) throw new AppError("CKB_RPC_HTTP_ERROR", `CKB RPC returned HTTP ${response.status}.`);
  const body = await response.json().catch(() => null);
  if (!body || body.error) throw new AppError("CKB_RPC_ERROR", String(body?.error?.message ?? "CKB RPC returned an invalid response."));
  return boundedJson(body.result);
}

function builtinTools(pluginId, runtime) {
  if (pluginId === "ckb-docs") return [
    {
      name: "ckb_docs_search", description: "Search the current official CKB documentation map (llms.txt). Use for version-sensitive CKB development questions.",
      inputSchema: { type: "object", properties: { query: { type: "string", description: "CKB concept, API, tool, or workflow to find" } }, required: ["query"], additionalProperties: false },
      execute: async ({ query }) => {
        const response = await fetchTimeout(runtime.fetchImpl, `${OFFICIAL_DOCS}/llms.txt`, { headers: { accept: "text/plain" } }, runtime.timeoutMs);
        if (!response.ok) throw new AppError("PLUGIN_HTTP_ERROR", `Official CKB docs returned HTTP ${response.status}.`);
        return { source: `${OFFICIAL_DOCS}/llms.txt`, matches: searchText(await response.text(), query) };
      }
    }
  ];
  if (pluginId === "ckb-community") return [
    {
      name: "ckb_community_latest", description: "Read recent public Nervos Talk topics. Use when the user asks what the CKB community is discussing, building, funding, or announcing.",
      inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 20 }, query: { type: "string" } }, additionalProperties: false },
      execute: async ({ limit = 8, query = "" }) => {
        const response = await fetchTimeout(runtime.fetchImpl, `${COMMUNITY_FORUM}/latest.json`, { headers: { accept: "application/json" } }, runtime.timeoutMs);
        if (!response.ok) throw new AppError("PLUGIN_HTTP_ERROR", `Nervos Talk returned HTTP ${response.status}.`);
        const body = await response.json();
        const q = String(query).toLowerCase().trim();
        const topics = (body?.topic_list?.topics ?? []).filter((t) => !q || String(t.title ?? "").toLowerCase().includes(q)).slice(0, Math.max(1, Math.min(20, Number(limit) || 8))).map((t) => ({ id: t.id, title: t.title, slug: t.slug, postsCount: t.posts_count, views: t.views, lastPostedAt: t.last_posted_at, url: `${COMMUNITY_FORUM}/t/${t.slug}/${t.id}` }));
        return { source: `${COMMUNITY_FORUM}/latest`, topics };
      }
    },
    {
      name: "ckb_community_resources", description: "Return trusted starting points for the CKB developer and community ecosystem.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: async () => ({
        resources: [
          { name: "Official CKB docs", url: "https://docs.nervos.org/", type: "docs" },
          { name: "Official CKB AI resources", url: "https://docs.nervos.org/docs/ai-agents/ai-resource", type: "ai" },
          { name: "CKB DevRel", url: "https://github.com/ckb-devrel", type: "development" },
          { name: "CCC", url: "https://github.com/ckb-devrel/ccc", type: "sdk" },
          { name: "Nervos Talk", url: "https://talk.nervos.org/", type: "community" }
        ]
      })
    }
  ];
  if (pluginId === "ckb-rpc") return [
    { name: "ckb_rpc_tip", description: "Get the current tip block number and tip header from the configured CKB node.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async () => ({ blockNumber: await ckbRpc(runtime, "get_tip_block_number", []), header: await ckbRpc(runtime, "get_tip_header", []) }) },
    { name: "ckb_rpc_blockchain_info", description: "Get read-only blockchain/node information from the configured CKB node.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async () => ckbRpc(runtime, "get_blockchain_info", []) },
    { name: "ckb_rpc_transaction", description: "Read a transaction by hash from the configured CKB node.", inputSchema: { type: "object", properties: { txHash: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" } }, required: ["txHash"], additionalProperties: false }, execute: async ({ txHash }) => ckbRpc(runtime, "get_transaction", [String(txHash)]) },
    { name: "ckb_rpc_live_cell", description: "Read a live Cell by out point from the configured CKB node.", inputSchema: { type: "object", properties: { txHash: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" }, index: { type: "string", pattern: "^0x[0-9a-fA-F]+$" }, withData: { type: "boolean" } }, required: ["txHash", "index"], additionalProperties: false }, execute: async ({ txHash, index, withData = true }) => ckbRpc(runtime, "get_live_cell", [{ tx_hash: String(txHash), index: String(index) }, Boolean(withData)]) }
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

export function validateCommunityPluginManifest(value, fileName = "community.plugin.json") {
  return manifestPlugin(value, fileName);
}

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
  const rootDir = runtime.rootDir ?? process.cwd();
  const catalog = aiPluginCatalog(rootDir);
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const requested = Array.isArray(pluginIds) && pluginIds.length ? pluginIds : catalog.filter((p) => p.enabledByDefault).map((p) => p.id);
  const ids = [...new Set(requested.map(cleanId))].slice(0, 8);
  const tools = [];
  const plugins = [];
  const execByName = new Map();
  const baseRuntime = { fetchImpl: runtime.fetchImpl ?? fetch, timeoutMs: runtime.timeoutMs ?? 12000, rpcUrl: runtime.rpcUrl };

  for (const id of ids) {
    const plugin = byId.get(id);
    if (!plugin) throw new AppError("PLUGIN_NOT_FOUND", `Unknown AI plugin: ${id}`);
    const entry = { id: plugin.id, name: plugin.name, trust: plugin.trust, permissions: plugin.permissions, transport: plugin.transport, status: "ready" };
    if (plugin.transport === "builtin") {
      const defs = builtinTools(id, baseRuntime);
      if (id === "ckb-rpc" && !baseRuntime.rpcUrl) entry.status = "configuration-required";
      for (const def of defs) {
        const functionName = safeFunctionName(id, def.name);
        tools.push({ name: functionName, description: `[${plugin.name}] ${def.description}`, inputSchema: def.inputSchema, pluginId: id, risk: "read" });
        execByName.set(functionName, async (args) => def.execute(args ?? {}));
      }
    } else if (plugin.transport === "mcp") {
      const discovery = await listMcpTools(plugin.endpoint, { fetchImpl: baseRuntime.fetchImpl, timeoutMs: baseRuntime.timeoutMs });
      entry.transportMode = discovery.transport;
      entry.toolCount = discovery.tools.length;
      for (const remoteTool of discovery.tools.slice(0, 48)) {
        const functionName = safeFunctionName(id, remoteTool.name);
        const readOnlyHint = remoteTool.annotations?.readOnlyHint === true;
        const destructiveHint = remoteTool.annotations?.destructiveHint === true;
        const hardBlocked = /(?:send[_-]?transaction|broadcast|sign(?:er|ing|ature)?|private[_-]?key|seed|mnemonic|submit[_-]?transaction)/i.test(remoteTool.name);
        const risk = hardBlocked ? "blocked" : (readOnlyHint && !destructiveHint ? "read" : "external");
        tools.push({ name: functionName, description: `[${plugin.name} MCP] ${remoteTool.description || remoteTool.name}`, inputSchema: remoteTool.inputSchema, pluginId: id, remoteName: remoteTool.name, risk });
        execByName.set(functionName, async (args) => {
          if (risk === "blocked") throw new AppError("PLUGIN_TOOL_BLOCKED", `CKBuilder blocks MCP tool ${remoteTool.name} because signing, broadcast, or secret-handling operations are outside the AI boundary.`);
          const approved = new Set(Array.isArray(runtime.approvedTools) ? runtime.approvedTools.map(String) : []);
          if (risk !== "read" && !approved.has(functionName)) throw new AppError("PLUGIN_CONFIRMATION_REQUIRED", `MCP tool ${remoteTool.name} is not explicitly marked read-only and requires approval.`);
          const called = await callMcpTool(plugin.endpoint, remoteTool.name, args ?? {}, { fetchImpl: baseRuntime.fetchImpl, timeoutMs: baseRuntime.timeoutMs });
          return boundedJson(called.result);
        });
      }
    }
    plugins.push(entry);
  }
  return { tools: tools.slice(0, 96), plugins, execute: async (name, args) => {
    const fn = execByName.get(name);
    if (!fn) throw new AppError("AI_TOOL_NOT_FOUND", `AI requested unknown tool: ${name}`);
    return fn(args);
  } };
}

export function pluginManifestTemplate() {
  return {
    schemaVersion: 1,
    id: "community-example",
    name: "Community Example MCP",
    description: "Describe what the plugin contributes to CKB builders.",
    source: "Your community/project name",
    transport: "mcp",
    endpoint: "https://example.org/mcp",
    disabled: true
  };
}
