import dns from "node:dns/promises";
import net from "node:net";
import { AppError } from "./errors.js";

export const MCP_PROTOCOL_CURRENT = "2026-07-28";
const LEGACY_PROTOCOL = "2025-11-25";
const CLIENT_INFO = { name: "ckbuilder-passport", version: "10.0.1" };
const MAX_RESPONSE_CHARS = 1024 * 1024;

function isLocalHost(hostname) {
  const host = String(hostname ?? "").replace(/^\[|\]$/g, "").toLowerCase();
  return new Set(["localhost", "127.0.0.1", "::1"]).has(host);
}

function isUnsafeIpv4(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return true;
  const [a,b] = p;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19));
}

function isUnsafeIp(ip) {
  const value = String(ip ?? "").replace(/^\[|\]$/g, "").toLowerCase();
  const kind = net.isIP(value);
  if (kind === 4) return isUnsafeIpv4(value);
  if (kind === 6) {
    if (value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb") || value.startsWith("ff")) return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
    if (mapped) return isUnsafeIpv4(mapped[1]);
  }
  return false;
}

function safeMcpUrl(value) {
  let url;
  try { url = new URL(String(value ?? "")); }
  catch { throw new AppError("MCP_URL_INVALID", "MCP endpoint must be a valid URL."); }
  if (!new Set(["https:", "http:"]).has(url.protocol)) throw new AppError("MCP_URL_INVALID", "MCP endpoint must use HTTP or HTTPS.");
  if (url.username || url.password) throw new AppError("MCP_URL_INVALID", "MCP endpoint must not contain embedded credentials.");
  const local = isLocalHost(url.hostname);
  if (url.protocol !== "https:" && !local) throw new AppError("MCP_URL_INSECURE", "Remote MCP endpoints must use HTTPS. HTTP is allowed only for localhost.");
  const literal = url.hostname.replace(/^\[|\]$/g, "");
  if (!local && net.isIP(literal) && isUnsafeIp(literal)) throw new AppError("MCP_URL_PRIVATE", "Remote MCP endpoints may not target private, loopback, link-local, benchmark, or multicast IP ranges.");
  return url.toString();
}

async function guardResolvedEndpoint(endpoint, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  if (fetchImpl !== fetch || options.resolveDns === false) return;
  const url = new URL(endpoint);
  if (isLocalHost(url.hostname) || net.isIP(url.hostname)) return;
  let answers;
  try { answers = await dns.lookup(url.hostname, { all: true, verbatim: true }); }
  catch { throw new AppError("MCP_DNS_UNAVAILABLE", "Could not safely resolve the MCP endpoint hostname."); }
  if (!answers.length || answers.some((entry) => isUnsafeIp(entry.address))) throw new AppError("MCP_URL_PRIVATE", "MCP endpoint DNS resolved to a non-public address; the request was blocked to prevent SSRF/DNS-rebinding access.");
}

function currentMeta() {
  return {
    "io.modelcontextprotocol/protocolVersion": MCP_PROTOCOL_CURRENT,
    "io.modelcontextprotocol/clientInfo": CLIENT_INFO,
    "io.modelcontextprotocol/clientCapabilities": {}
  };
}

function sseJson(text) {
  const events = String(text ?? "").split(/\r?\n\r?\n/);
  let last;
  for (const event of events) {
    const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
    if (!data || data === "[DONE]") continue;
    try { last = JSON.parse(data); } catch {}
  }
  return last;
}

async function parseResponse(response) {
  const declared = Number(response.headers?.get?.("content-length") ?? 0);
  if (declared > MAX_RESPONSE_CHARS) throw new AppError("MCP_RESPONSE_TOO_LARGE", "MCP server response exceeded the configured safety limit.");
  const text = await response.text().catch(() => "");
  if (text.length > MAX_RESPONSE_CHARS) throw new AppError("MCP_RESPONSE_TOO_LARGE", "MCP server response exceeded the configured safety limit.");
  const type = String(response.headers?.get?.("content-type") ?? "").toLowerCase();
  if (type.includes("text/event-stream")) {
    const parsed = sseJson(text);
    if (!parsed) throw new AppError("MCP_RESPONSE_INVALID", "MCP server returned an unreadable event stream.");
    return parsed;
  }
  try { return JSON.parse(text); }
  catch { throw new AppError("MCP_RESPONSE_INVALID", "MCP server returned invalid JSON.", { detail: String(text).slice(0, 240) }); }
}

function authorizationHeader(options = {}) {
  const value = String(options.authorization ?? "").trim();
  if (!value) return {};
  if (value.length > 8192 || /[\r\n]/.test(value)) throw new AppError("MCP_AUTH_INVALID", "MCP authorization value is invalid.");
  return { authorization: value };
}

async function post(fetchImpl, endpoint, body, headers = {}, timeoutMs = 15000, options = {}) {
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...authorizationHeader(options), ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("MCP_UNAVAILABLE", "Could not reach the MCP server without following redirects.");
  }
  return response;
}

function assertRpc(result) {
  if (result?.error) throw new AppError("MCP_TOOL_ERROR", String(result.error.message ?? "MCP request failed."), { code: result.error.code, data: result.error.data });
  return result?.result;
}

function currentEnvelope(id, method, params = {}) {
  return { jsonrpc: "2.0", id, method, params: { ...params, _meta: currentMeta() } };
}

function currentHeaders(method, name) {
  return { "MCP-Protocol-Version": MCP_PROTOCOL_CURRENT, "Mcp-Method": method, ...(name ? { "Mcp-Name": name } : {}) };
}

async function currentRequest(fetchImpl, endpoint, method, params, options = {}) {
  const response = await post(fetchImpl, endpoint, currentEnvelope(options.id ?? 1, method, params), currentHeaders(method, params?.name), options.timeoutMs, options);
  if (!response.ok) return { supported: false, status: response.status };
  return { supported: true, result: assertRpc(await parseResponse(response)) };
}

async function legacySession(fetchImpl, endpoint, options = {}) {
  const initBody = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: LEGACY_PROTOCOL, capabilities: {}, clientInfo: CLIENT_INFO } };
  const init = await post(fetchImpl, endpoint, initBody, {}, options.timeoutMs, options);
  if (!init.ok) throw new AppError("MCP_PROTOCOL_UNSUPPORTED", `MCP server rejected current and legacy initialization (HTTP ${init.status}).`);
  const initialized = assertRpc(await parseResponse(init));
  const session = init.headers?.get?.("mcp-session-id") ?? init.headers?.get?.("Mcp-Session-Id") ?? null;
  const protocolVersion = initialized?.protocolVersion ?? LEGACY_PROTOCOL;
  const headers = { "MCP-Protocol-Version": protocolVersion, ...(session ? { "Mcp-Session-Id": session } : {}) };
  const note = { jsonrpc: "2.0", method: "notifications/initialized", params: {} };
  await post(fetchImpl, endpoint, note, headers, options.timeoutMs, options).catch(() => null);
  return { headers, protocolVersion, session };
}

async function legacyRequest(fetchImpl, endpoint, method, params, options = {}) {
  const session = options.legacy ?? await legacySession(fetchImpl, endpoint, options);
  const response = await post(fetchImpl, endpoint, { jsonrpc: "2.0", id: options.id ?? 2, method, params: params ?? {} }, session.headers, options.timeoutMs, options);
  if (!response.ok) throw new AppError("MCP_HTTP_ERROR", `MCP server returned HTTP ${response.status}.`);
  return { result: assertRpc(await parseResponse(response)), legacy: session };
}

export async function discoverMcpServer(endpointValue, options = {}) {
  const endpoint = safeMcpUrl(endpointValue); const fetchImpl = options.fetchImpl ?? fetch;
  await guardResolvedEndpoint(endpoint, { ...options, fetchImpl });
  const current = await currentRequest(fetchImpl, endpoint, "server/discover", {}, options);
  if (!current.supported) return { endpoint, supported: false, status: current.status, protocolVersion: MCP_PROTOCOL_CURRENT };
  return { endpoint, supported: true, protocolVersion: MCP_PROTOCOL_CURRENT, result: current.result };
}

export async function listMcpTools(endpointValue, options = {}) {
  const endpoint = safeMcpUrl(endpointValue); const fetchImpl = options.fetchImpl ?? fetch;
  await guardResolvedEndpoint(endpoint, { ...options, fetchImpl });
  const current = await currentRequest(fetchImpl, endpoint, "tools/list", {}, options);
  let result; let transport = "2026-stateless";
  if (current.supported) result = current.result;
  else { const legacy = await legacyRequest(fetchImpl, endpoint, "tools/list", {}, options); result = legacy.result; transport = "legacy-session"; }
  const tools = Array.isArray(result?.tools) ? result.tools : [];
  return {
    endpoint, transport,
    cache: { ttlMs: Number.isFinite(result?.ttlMs) ? result.ttlMs : null, scope: result?.cacheScope ?? null },
    tools: tools.slice(0, 128).map((tool) => ({
      name: String(tool?.name ?? "").slice(0, 160), description: String(tool?.description ?? "").slice(0, 1000),
      inputSchema: tool?.inputSchema && typeof tool.inputSchema === "object" ? tool.inputSchema : { type: "object", properties: {} },
      outputSchema: tool?.outputSchema && typeof tool.outputSchema === "object" ? tool.outputSchema : undefined,
      annotations: tool?.annotations && typeof tool.annotations === "object" ? tool.annotations : undefined
    })).filter((tool) => tool.name)
  };
}

export async function callMcpTool(endpointValue, name, args = {}, options = {}) {
  const endpoint = safeMcpUrl(endpointValue); const toolName = String(name ?? "").trim();
  if (!toolName || toolName.length > 160) throw new AppError("MCP_TOOL_INVALID", "MCP tool name is invalid.");
  const fetchImpl = options.fetchImpl ?? fetch;
  await guardResolvedEndpoint(endpoint, { ...options, fetchImpl });
  const params = { name: toolName, arguments: args && typeof args === "object" ? args : {} };
  const current = await currentRequest(fetchImpl, endpoint, "tools/call", params, options);
  let result; let transport = "2026-stateless";
  if (current.supported) result = current.result;
  else { const legacy = await legacyRequest(fetchImpl, endpoint, "tools/call", params, options); result = legacy.result; transport = "legacy-session"; }
  return { endpoint, transport, result, inputRequired: result?.resultType === "input_required" };
}

export function validateMcpEndpoint(value) { return safeMcpUrl(value); }
