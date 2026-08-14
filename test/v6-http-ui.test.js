import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createInspectorServer } from "../src/lib/inspector-http.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(repoRoot, "public", "index.html"), "utf8");
const app = fs.readFileSync(path.join(repoRoot, "public", "app.js"), "utf8");

async function withInspector(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ckbuilder-v6http-"));
  const publicDir = path.join(root, "public");
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, "index.html"), "<title>v6</title>");
  const config = {
    ROOT_DIR: repoRoot,
    DATA_DIR: path.join(root, "data"),
    APP_NETWORK: "devnet",
    CKB_RPC_URL: "http://127.0.0.1:8114",
    PUBLIC_BASE_URL: "http://example.test",
    AI_ENABLED: true,
    AI_DEFAULT_PROVIDER: "openai",
    AI_DEFAULT_MODEL: "gpt-4.1-mini",
    PUBLIC_DIRECTORY_ENABLED: false
  };
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  const server = createInspectorServer({ config, publicDir, learningOverview: () => ({ summary: {} }), inspectCredential: async () => ({}) });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); }
}

test("v6 health endpoint reports the real-agent release", async () => withInspector(async (base) => {
  const body = await (await fetch(`${base}/api/health`)).json();
  assert.equal(body.version, "8.0.0");
  assert.equal(body.readOnly, true);
  assert.equal(body.privateKeyRequired, false);
}));

test("v6 config publishes safe plugin metadata without secrets or implementation functions", async () => withInspector(async (base) => {
  const body = await (await fetch(`${base}/api/config`)).json();
  assert.ok(body.aiPlugins.some((plugin) => plugin.id === "ckb-docs"));
  assert.ok(body.aiPlugins.some((plugin) => plugin.id === "ckb-community"));
  assert.ok(body.aiPlugins.some((plugin) => plugin.id === "ckb-rpc"));
  assert.ok(body.aiPlugins.some((plugin) => plugin.id === "ckb-ai-mcp"));
  const serialized = JSON.stringify(body.aiPlugins);
  assert.equal(serialized.includes("apiKey"), false);
  assert.equal(serialized.includes("execute"), false);
  assert.equal(serialized.includes("systemPrompt"), false);
}));

test("v6 plugin catalog keeps remote community MCP disabled by default", async () => withInspector(async (base) => {
  const body = await (await fetch(`${base}/api/config`)).json();
  const mcp = body.aiPlugins.find((plugin) => plugin.id === "ckb-ai-mcp");
  assert.equal(mcp.transport, "mcp");
  assert.equal(mcp.enabledByDefault, false);
  assert.equal(mcp.trust, "community-alpha");
}));

test("v6 public workbench exposes plugins, step budget, signing boundary, and audit trace", () => {
  for (const id of ["ai-plugin-list", "ai-agent-max-steps", "ai-agent-trace"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /No signing \/ no broadcast/);
  assert.match(html, /Run tool-using agent/);
});

test("v6 browser sends selected plugins and bounded maxSteps to the agent API", () => {
  assert.match(app, /querySelectorAll\("\[data-ai-plugin='1'\]:checked"\)/);
  assert.match(app, /const payload = \{ agent: .* task, context, plugins, maxSteps \}/);
  assert.match(app, /postJsonWithHeaders\("\/api\/ai\/agent", payload/);
});

test("v6 browser requires explicit one-run confirmation for untrusted MCP tools", () => {
  assert.match(app, /if \(result\.approvalRequired\)/);
  assert.match(app, /window\.confirm/);
  assert.match(app, /approvedTools: \[approval\.tool\]/);
  assert.match(app, /not marked read-only by its MCP server/);
});

test("v6 browser renders a tool audit trail instead of hiding plugin execution", () => {
  assert.match(app, /result\.toolTrace/);
  assert.match(app, /Agent tool audit/);
  assert.match(app, /item\.pluginId/);
  assert.match(app, /item\.status/);
});
