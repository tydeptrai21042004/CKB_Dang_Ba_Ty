import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { aiPluginCatalog, resolveAgentTools } from "../src/lib/plugin-service.js";

function jsonResponse(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }); }
function tmpRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), "ckbuilder-v7plugin-")); }

test("v7 plugin catalog adds Fiber operations, project radar, and safe local workspace", () => {
  const ids = aiPluginCatalog(tmpRoot()).map((item) => item.id);
  for (const id of ["ckb-github", "fiber-rpc", "ckb-workspace"]) assert.ok(ids.includes(id));
});

test("v7 Fiber health snapshot performs only read-only operator RPC calls", async () => {
  const methods = [];
  const runtime = await resolveAgentTools(["fiber-rpc"], {
    rootDir: tmpRoot(), fiberRpcUrl: "http://127.0.0.1:8227",
    fetchImpl: async (_url, options) => { const body = JSON.parse(options.body); methods.push(body.method); return jsonResponse({ jsonrpc: "2.0", id: body.id, result: { method: body.method, ok: true } }); }
  });
  const health = runtime.tools.find((tool) => tool.name.endsWith("fiber_health_snapshot"));
  const output = await runtime.execute(health.name, {});
  assert.equal(output.node.ok, true); assert.equal(output.channels.ok, true); assert.equal(output.payments.ok, true);
  assert.ok(methods.includes("node_info")); assert.ok(methods.includes("list_channels")); assert.ok(methods.includes("list_payments"));
  for (const forbidden of ["send_payment", "open_channel", "shutdown_channel", "add_tlc", "remove_tlc"]) assert.equal(methods.includes(forbidden), false);
});

test("v7 Fiber plugin reports configuration-required instead of pretending live evidence exists", async () => {
  const runtime = await resolveAgentTools(["fiber-rpc"], { rootDir: tmpRoot(), fetchImpl: async () => { throw new Error("network should not run"); } });
  assert.equal(runtime.plugins[0].status, "configuration-required");
  const tool = runtime.tools.find((item) => item.name.endsWith("fiber_node_info"));
  await assert.rejects(() => runtime.execute(tool.name, {}), (error) => error.code === "FIBER_RPC_NOT_CONFIGURED");
});

test("v7 CKB dry-run tool never broadcasts the supplied transaction", async () => {
  const methods = [];
  const runtime = await resolveAgentTools(["ckb-rpc"], { rootDir: tmpRoot(), rpcUrl: "http://127.0.0.1:8114", fetchImpl: async (_url, options) => { const body = JSON.parse(options.body); methods.push(body.method); return jsonResponse({ jsonrpc: "2.0", id: 1, result: { cycles: "0x2a" } }); } });
  const dryRun = runtime.tools.find((tool) => tool.name.endsWith("ckb_rpc_dry_run_transaction"));
  const result = await runtime.execute(dryRun.name, { transaction: { version: "0x0", cell_deps: [], header_deps: [], inputs: [], outputs: [], outputs_data: [], witnesses: [] } });
  assert.equal(result.cycles, "0x2a"); assert.deepEqual(methods, ["dry_run_transaction"]); assert.equal(methods.includes("send_transaction"), false);
});

test("v7 project radar returns current issue evidence but filters pull requests", async () => {
  let requestedUrl = "";
  const runtime = await resolveAgentTools(["ckb-github"], { rootDir: tmpRoot(), fetchImpl: async (url) => { requestedUrl = String(url); return jsonResponse([
    { number: 11, title: "Good first issue: improve CCC example", html_url: "https://github.test/11", labels: [{ name: "good first issue" }], comments: 2, created_at: "2026-08-01", updated_at: "2026-08-13", user: { login: "dev" } },
    { number: 12, title: "PR", pull_request: {}, html_url: "https://github.test/12", labels: [] }
  ]); } });
  const tool = runtime.tools.find((item) => item.name.endsWith("ckb_open_issues"));
  const result = await runtime.execute(tool.name, { project: "ccc", query: "CCC", limit: 5 });
  assert.match(requestedUrl, /ckb-devrel\/ccc\/issues/); assert.equal(result.issues.length, 1); assert.equal(result.issues[0].number, 11);
});

test("v7 local workspace can inspect source while blocking env, keys, and traversal", async () => {
  const root = tmpRoot(); fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "Cargo.toml"), "[package]\nname='cell-app'\n");
  fs.writeFileSync(path.join(root, "src", "main.rs"), "fn main() { /* ckb-testtool */ }\n");
  fs.writeFileSync(path.join(root, ".env"), "SECRET=do-not-read\n");
  fs.writeFileSync(path.join(root, "private_key.txt"), "secret\n");
  const runtime = await resolveAgentTools(["ckb-workspace"], { rootDir: tmpRoot(), workspaceDir: root, fetchImpl: async () => { throw new Error("network not needed"); } });
  const summary = runtime.tools.find((item) => item.name.endsWith("ckb_workspace_summary"));
  const search = runtime.tools.find((item) => item.name.endsWith("ckb_workspace_search"));
  const read = runtime.tools.find((item) => item.name.endsWith("ckb_workspace_read_file"));
  const files = await runtime.execute(summary.name, {}); assert.ok(files.files.includes("src/main.rs")); assert.equal(files.files.includes(".env"), false); assert.equal(files.files.includes("private_key.txt"), false);
  const found = await runtime.execute(search.name, { query: "ckb-testtool" }); assert.equal(found.matches[0].file, "src/main.rs");
  await assert.rejects(() => runtime.execute(read.name, { path: ".env" }), (error) => error.code === "CKB_WORKSPACE_FILE_BLOCKED");
  await assert.rejects(() => runtime.execute(read.name, { path: "../outside.txt" }), (error) => error.code === "CKB_WORKSPACE_FILE_BLOCKED");
});

test("v7 community MCP cannot smuggle Fiber payment/channel mutation through approval", async () => {
  const root = tmpRoot(); fs.mkdirSync(path.join(root, "plugins", "community"), { recursive: true });
  fs.writeFileSync(path.join(root, "plugins", "community", "fiber-extra.json"), JSON.stringify({ schemaVersion: 1, id: "fiber-extra", name: "Fiber Extra", transport: "mcp", endpoint: "https://example.test/mcp" }));
  const runtime = await resolveAgentTools(["fiber-extra"], {
    rootDir: root, approvedTools: ["fiber-extra__send_payment"],
    fetchImpl: async (_url, options) => { const body = JSON.parse(options.body); if (body.method === "tools/list") return jsonResponse({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "send_payment", description: "pay", inputSchema: { type: "object" } }] } }); throw new Error("hard blocked tool must not reach tools/call"); }
  });
  const tool = runtime.tools.find((item) => item.remoteName === "send_payment"); assert.equal(tool.risk, "blocked");
  await assert.rejects(() => runtime.execute(tool.name, {}), (error) => error.code === "PLUGIN_TOOL_BLOCKED");
});

test("v7 Fiber snapshot preserves partial evidence when one evolving RPC method fails", async () => {
  const runtime = await resolveAgentTools(["fiber-rpc"], { rootDir: tmpRoot(), fiberRpcUrl: "http://127.0.0.1:8227", fetchImpl: async (_url, options) => { const body = JSON.parse(options.body); if (body.method === "graph_channels") return jsonResponse({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "method not found" } }); return jsonResponse({ jsonrpc: "2.0", id: 1, result: [] }); } });
  const tool = runtime.tools.find((item) => item.name.endsWith("fiber_health_snapshot")); const result = await runtime.execute(tool.name, {});
  assert.equal(result.node.ok, true); assert.equal(result.graphChannels.ok, false); assert.equal(result.graphChannels.code, "FIBER_RPC_ERROR");
});

test("v7 workspace allows legitimate wallet integration source names while still blocking secrets", async () => {
  const root = tmpRoot(); fs.writeFileSync(path.join(root, "wallet-connector.ts"), "export const wallet = 'CCC';\n"); fs.writeFileSync(path.join(root, "seed.txt"), "never expose\n");
  const runtime = await resolveAgentTools(["ckb-workspace"], { rootDir: tmpRoot(), workspaceDir: root }); const summary = runtime.tools.find((item) => item.name.endsWith("ckb_workspace_summary")); const result = await runtime.execute(summary.name, {});
  assert.ok(result.files.includes("wallet-connector.ts")); assert.equal(result.files.includes("seed.txt"), false);
});

test("v7 project radar uses optional GitHub token only in the outbound GitHub request", async () => {
  let authorization = "";
  const runtime = await resolveAgentTools(["ckb-github"], { rootDir: tmpRoot(), githubToken: "ghp_server_only", fetchImpl: async (_url, options) => { authorization = options.headers.authorization; return jsonResponse([]); } });
  const tool = runtime.tools.find((item) => item.name.endsWith("ckb_open_issues")); await runtime.execute(tool.name, { project: "fiber" });
  assert.equal(authorization, "Bearer ghp_server_only"); assert.equal(JSON.stringify(runtime.plugins).includes("ghp_server_only"), false);
});

test("v7 MCP open-channel mutation is hard blocked even after explicit approval", async () => {
  const root = tmpRoot(); fs.mkdirSync(path.join(root, "plugins", "community"), { recursive: true });
  fs.writeFileSync(path.join(root, "plugins", "community", "x.json"), JSON.stringify({ schemaVersion: 1, id: "channel-extra", name: "Channel Extra", transport: "mcp", endpoint: "https://example.test/mcp" }));
  const runtime = await resolveAgentTools(["channel-extra"], { rootDir: root, approvedTools: ["channel-extra__open_channel"], fetchImpl: async (_url, options) => { const body = JSON.parse(options.body); if (body.method === "tools/list") return jsonResponse({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "open_channel", inputSchema: { type: "object" } }] } }); throw new Error("must not call mutation"); } });
  const tool = runtime.tools.find((item) => item.remoteName === "open_channel"); await assert.rejects(() => runtime.execute(tool.name, {}), (error) => error.code === "PLUGIN_TOOL_BLOCKED");
});
