import { AppError } from "./errors.js";

export const MCP_PROTOCOL_CURRENT = "2026-07-28";
const LEGACY_PROTOCOL = "2025-11-25";
const CLIENT_INFO = { name: "ckbuilder-passport", version: "8.0.0" };

function safeMcpUrl(value) {
  let url;
  try { url = new URL(String(value ?? "")); }
  catch { throw new AppError("MCP_URL_INVALID", "MCP endpoint must be a valid URL."); }
  if (!new Set(["https:", "http:"]).has(url.protocol)) throw new AppError("MCP_URL_INVALID", "MCP endpoint must use HTTP or HTTPS.");
  if (url.username || url.password) throw new AppError("MCP_URL_INVALID", "MCP endpoint must not contain embedded credentials.");
  const local = new Set(["localhost", "127.0.0.1", "::1"]).has(url.hostname);
  if (url.protocol !== "https:" && !local) throw new AppError("MCP_URL_INSECURE", "Remote MCP endpoints must use HTTPS. HTTP is allowed only for localhost.");
  return url.toString();
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
  const type = String(response.headers?.get?.("content-type") ?? "").toLowerCase();
  if (type.includes("text/event-stream")) {
    const parsed = sseJson(await response.text());
    if (!parsed) throw new AppError("MCP_RESPONSE_INVALID", "MCP server returned an unreadable event stream.");
    return parsed;
  }
  try { return await response.json(); }
  catch {
    const text = await response.text?.().catch?.(() => "") ?? "";
    throw new AppError("MCP_RESPONSE_INVALID", "MCP server returned invalid JSON.", { detail: String(text).slice(0, 240) });
  }
}

async function post(fetchImpl, endpoint, body, headers = {}, timeoutMs = 15000) {
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch {
    throw new AppError("MCP_UNAVAILABLE", "Could not reach the MCP server.");
  }
  return response;
}

function assertRpc(result) {
  if (result?.error) throw new AppError("MCP_TOOL_ERROR", String(result.error.message ?? "MCP request failed."), { code: result.error.code });
  return result?.result;
}

function currentEnvelope(id, method, params = {}) {
  return { jsonrpc: "2.0", id, method, params: { ...params, _meta: currentMeta() } };
}

function currentHeaders(method, name) {
  return {
    "MCP-Protocol-Version": MCP_PROTOCOL_CURRENT,
    "Mcp-Method": method,
    ...(name ? { "Mcp-Name": name } : {})
  };
}

async function currentRequest(fetchImpl, endpoint, method, params, options = {}) {
  const response = await post(fetchImpl, endpoint, currentEnvelope(options.id ?? 1, method, params), currentHeaders(method, params?.name), options.timeoutMs);
  if (!response.ok) return { supported: false, status: response.status };
  return { supported: true, result: assertRpc(await parseResponse(response)) };
}

async function legacySession(fetchImpl, endpoint, options = {}) {
  const initBody = {
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: LEGACY_PROTOCOL, capabilities: {}, clientInfo: CLIENT_INFO }
  };
  const init = await post(fetchImpl, endpoint, initBody, {}, options.timeoutMs);
  if (!init.ok) throw new AppError("MCP_PROTOCOL_UNSUPPORTED", `MCP server rejected current and legacy initialization (HTTP ${init.status}).`);
  const initialized = assertRpc(await parseResponse(init));
  const session = init.headers?.get?.("mcp-session-id") ?? init.headers?.get?.("Mcp-Session-Id") ?? null;
  const protocolVersion = initialized?.protocolVersion ?? LEGACY_PROTOCOL;
  const headers = { "MCP-Protocol-Version": protocolVersion, ...(session ? { "Mcp-Session-Id": session } : {}) };
  const note = { jsonrpc: "2.0", method: "notifications/initialized", params: {} };
  await post(fetchImpl, endpoint, note, headers, options.timeoutMs).catch(() => null);
  return { headers, protocolVersion, session };
}

async function legacyRequest(fetchImpl, endpoint, method, params, options = {}) {
  const session = options.legacy ?? await legacySession(fetchImpl, endpoint, options);
  const response = await post(fetchImpl, endpoint, { jsonrpc: "2.0", id: options.id ?? 2, method, params: params ?? {} }, session.headers, options.timeoutMs);
  if (!response.ok) throw new AppError("MCP_HTTP_ERROR", `MCP server returned HTTP ${response.status}.`);
  return { result: assertRpc(await parseResponse(response)), legacy: session };
}

export async function listMcpTools(endpointValue, options = {}) {
  const endpoint = safeMcpUrl(endpointValue);
  const fetchImpl = options.fetchImpl ?? fetch;
  const current = await currentRequest(fetchImpl, endpoint, "tools/list", {}, options);
  let result;
  let transport = "2026-stateless";
  if (current.supported) result = current.result;
  else {
    const legacy = await legacyRequest(fetchImpl, endpoint, "tools/list", {}, options);
    result = legacy.result;
    transport = "legacy-session";
  }
  const tools = Array.isArray(result?.tools) ? result.tools : [];
  return {
    endpoint,
    transport,
    tools: tools.slice(0, 128).map((tool) => ({
      name: String(tool?.name ?? "").slice(0, 160),
      description: String(tool?.description ?? "").slice(0, 1000),
      inputSchema: tool?.inputSchema && typeof tool.inputSchema === "object" ? tool.inputSchema : { type: "object", properties: {} },
      annotations: tool?.annotations && typeof tool.annotations === "object" ? tool.annotations : undefined
    })).filter((tool) => tool.name)
  };
}

export async function callMcpTool(endpointValue, name, args = {}, options = {}) {
  const endpoint = safeMcpUrl(endpointValue);
  const toolName = String(name ?? "").trim();
  if (!toolName || toolName.length > 160) throw new AppError("MCP_TOOL_INVALID", "MCP tool name is invalid.");
  const fetchImpl = options.fetchImpl ?? fetch;
  const params = { name: toolName, arguments: args && typeof args === "object" ? args : {} };
  const current = await currentRequest(fetchImpl, endpoint, "tools/call", params, options);
  let result;
  let transport = "2026-stateless";
  if (current.supported) result = current.result;
  else {
    const legacy = await legacyRequest(fetchImpl, endpoint, "tools/call", params, options);
    result = legacy.result;
    transport = "legacy-session";
  }
  return { endpoint, transport, result };
}

export function validateMcpEndpoint(value) { return safeMcpUrl(value); }
