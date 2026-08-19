import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";
import { createInspectorServer } from "../src/lib/inspector-http.js";

async function withServer(configExtra, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ckbuilder-hardening-"));
  const publicDir = path.join(root, "public");
  const dataDir = path.join(root, "data");
  fs.mkdirSync(publicDir); fs.mkdirSync(dataDir);
  fs.writeFileSync(path.join(publicDir, "index.html"), "ok");
  const server = createInspectorServer({
    config: { ROOT_DIR: process.cwd(), DATA_DIR: dataDir, APP_NETWORK: "testnet", CKB_RPC_URL: "http://127.0.0.1:8114", PUBLIC_BASE_URL: "http://x", AI_ENABLED: false, PUBLIC_DIRECTORY_ENABLED: false, TRUST_PROXY: false, ...configExtra },
    publicDir, learningOverview: () => ({ summary: {} }), logger: { error() {} }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); }
}

test("public rate limiting does not trust spoofed X-Forwarded-For by default", async () => {
  await withServer({}, async (base) => {
    let response;
    for (let i = 0; i < 46; i += 1) response = await fetch(`${base}/api/learning`, { headers: { "x-forwarded-for": `198.51.100.${(i % 200) + 1}` } });
    assert.equal(response.status, 429);
  });
});

test("trusted Vercel proxy rate limiting prefers the platform-owned client IP header", async () => {
  await withServer({ TRUST_PROXY: true }, async (base) => {
    let response;
    for (let i = 0; i < 46; i += 1) {
      response = await fetch(`${base}/api/learning`, {
        headers: {
          "x-vercel-forwarded-for": "203.0.113.77",
          "x-forwarded-for": `198.51.100.${(i % 200) + 1}`
        }
      });
    }
    assert.equal(response.status, 429);
  });
});
