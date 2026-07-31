import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createInspectorServer, safeStaticPath } from "../src/lib/inspector-http.js";
import { PUBLIC_PROOF_SCHEMA } from "../src/lib/public-inspector.js";
import { publicProofDigest } from "../src/lib/proof-verifier.js";
import { encodeRevocationRecord } from "../src/lib/revocation-binary.js";

const config = {
  APP_NETWORK: "devnet",
  CKB_RPC_URL: "http://127.0.0.1:28114",
  ISSUER_LOCK_HASH: `0x${"11".repeat(32)}`
};

async function withServer(options, callback) {
  const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), "ckb-http-public-"));
  fs.writeFileSync(path.join(publicDir, "index.html"), "<!doctype html><title>test</title>");
  const server = createInspectorServer({
    config,
    publicDir,
    logger: { error() {} },
    inspectCredential: async (_config, credentialId, inspectOptions) => ({
      credentialId,
      documentProvided: Boolean(inspectOptions.documentPath),
      skipChain: inspectOptions.skipChain,
      readOnly: true
    }),
    ...options
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    return await callback(`http://127.0.0.1:${address.port}`, publicDir);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function validProof() {
  const proof = {
    schema: PUBLIC_PROOF_SCHEMA,
    generatedAt: "2026-07-22T00:00:00.000Z",
    credentialId: "HTTP-PROOF-001",
    readOnly: true,
    privateKeyRequired: false,
    outcome: "ACTIVE_VALID"
  };
  return { ...proof, proofDigest: publicProofDigest(proof) };
}

test("static path resolver blocks traversal and accepts files inside public root", () => {
  const root = path.resolve("/tmp/public-root");
  assert.equal(safeStaticPath(root, "/index.html"), path.join(root, "index.html"));
  assert.equal(safeStaticPath(root, "/../secret"), null);
  assert.equal(safeStaticPath(root, "/%2e%2e/secret"), null);
  assert.equal(safeStaticPath(root, "/%00"), null);
});

test("health endpoint advertises read-only community formats and security headers", async () => {
  await withServer({}, async (base) => {
    const response = await fetch(`${base}/api/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.privateKeyRequired, false);
    assert.equal(body.communityFormats.includes("ckb-degree-credential-cell/v1"), true);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
    assert.match(response.headers.get("x-request-id"), /^[0-9a-f-]{36}$/);
  });
});

test("learning endpoint exposes accurate read-only progress", async () => {
  const learning = {
    schema: "ckbuilder-learning-progress/v1",
    summary: { completed: 22, total: 40, percent: 55 },
    tracks: []
  };
  await withServer({ learningOverview: () => learning }, async (base) => {
    const response = await fetch(`${base}/api/learning`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), learning);
  });
});

test("inspect endpoint accepts canonical JSON and handles an uploaded document", async () => {
  await withServer({}, async (base) => {
    const response = await fetch(`${base}/api/inspect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credentialId: "HTTP-001", documentBase64: Buffer.from("certificate").toString("base64"), skipChain: true })
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.credentialId, "HTTP-001");
    assert.equal(body.documentProvided, true);
    assert.equal(body.skipChain, true);
  });
});

test("API rejects non-JSON requests and invalid base64", async () => {
  await withServer({}, async (base) => {
    const wrongType = await fetch(`${base}/api/inspect`, { method: "POST", body: "{}" });
    assert.equal(wrongType.status, 415);
    assert.equal((await wrongType.json()).error, "CONTENT_TYPE_INVALID");

    const invalid = await fetch(`${base}/api/inspect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credentialId: "HTTP-001", documentBase64: "%%%" })
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error, "DOCUMENT_BASE64_INVALID");
  });
});

test("API enforces decoded document and request-body limits", async () => {
  await withServer({ maxDocumentBytes: 4, maxBodyBytes: 100 }, async (base) => {
    const documentTooLarge = await fetch(`${base}/api/inspect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credentialId: "HTTP-001", documentBase64: Buffer.from("12345").toString("base64") })
    });
    assert.equal(documentTooLarge.status, 413);
    assert.equal((await documentTooLarge.json()).error, "DOCUMENT_TOO_LARGE");

    const bodyTooLarge = await fetch(`${base}/api/inspect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credentialId: "X".repeat(200) })
    });
    assert.equal(bodyTooLarge.status, 413);
    assert.equal((await bodyTooLarge.json()).error, "REQUEST_TOO_LARGE");
  });
});

test("Cell decoder endpoint returns canonical and validation-error states", async () => {
  const cellData = `0x${encodeRevocationRecord({ status: 0, credentialId: "HTTP-CELL", issuerLockHash: config.ISSUER_LOCK_HASH }).toString("hex")}`;
  await withServer({}, async (base) => {
    const valid = await fetch(`${base}/api/decode-cell`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cellData })
    });
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).statusName, "ACTIVE");

    const bytes = Buffer.from(cellData.slice(2), "hex");
    bytes[1] = 9;
    const invalid = await fetch(`${base}/api/decode-cell`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cellData: `0x${bytes.toString("hex")}` })
    });
    assert.equal(invalid.status, 422);
    assert.equal((await invalid.json()).errors.includes("INVALID_STATUS"), true);
  });
});

test("proof endpoint accepts untampered proof and rejects modified proof", async () => {
  await withServer({}, async (base) => {
    const proof = validProof();
    const valid = await fetch(`${base}/api/verify-proof`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proof })
    });
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).valid, true);

    proof.outcome = "REVOKED";
    const invalid = await fetch(`${base}/api/verify-proof`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proof })
    });
    assert.equal(invalid.status, 422);
    assert.equal((await invalid.json()).valid, false);
  });
});

test("static files are served but unsupported methods and missing paths are rejected", async () => {
  await withServer({}, async (base) => {
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /<title>test<\/title>/);

    const method = await fetch(`${base}/api/health`, { method: "DELETE" });
    assert.equal(method.status, 405);

    const missing = await fetch(`${base}/missing.txt`);
    assert.equal(missing.status, 404);
  });
});
