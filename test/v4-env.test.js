import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envModuleUrl = pathToFileURL(path.join(root, "src", "lib", "env.js")).href;

function publicInjectedEnv(overrides = {}) {
  return {
    ...process.env,
    CKBUILDER_PROCESS_ENV_ONLY: "1",
    APP_NETWORK: "mainnet",
    CKB_RPC_URL: "https://example.invalid",
    ISSUER_LOCK_HASH: `0x${"11".repeat(32)}`,
    DATA_DIR: "./data",
    TRUSTED_ISSUERS_FILE: "./data/trusted-issuers.json",
    OFFCKB_SYSTEM_SCRIPTS: "./deployment/system-scripts.json",
    OFFCKB_DEPLOYMENT_SCRIPTS: "./deployment/scripts.json",
    OFFCKB_CHAIN_STATE: "./data/offckb-chain-state.json",
    REQUIRE_CKB_RPC: "0",
    PUBLIC_DIRECTORY_ENABLED: "1",
    ADMIN_PASSWORD: "must-never-enter-public-config",
    SESSION_SECRET: "must-never-enter-public-config-either",
    WEBHOOK_SECRET: "must-never-enter-public-config-either",
    ...overrides
  };
}

function runModule(code, cwd, env) {
  return spawnSync(process.execPath, ["--input-type=module", "-e", code, cwd], {
    cwd: root,
    env,
    encoding: "utf8"
  });
}

test("v4 process-environment-only mode boots the public service without a physical .env", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ckbuilder-v4-public-env-"));
  try {
    const code = `import {loadPublicInspectorEnv} from ${JSON.stringify(envModuleUrl)}; const c=loadPublicInspectorEnv(process.argv[1]); console.log(JSON.stringify(c));`;
    const result = runModule(code, temp, publicInjectedEnv());
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(result.stdout.trim());
    assert.equal(config.APP_NETWORK, "mainnet");
    assert.equal(config.PUBLIC_DIRECTORY_ENABLED, true);
    for (const secret of ["ADMIN_PASSWORD", "SESSION_SECRET", "WEBHOOK_SECRET", "ISSUER_PRIVATE_KEY_PATH", "CKB_ISSUER_PRIVATE_KEY_FILE"]) {
      assert.equal(Object.hasOwn(config, secret), false, `${secret} leaked into public config`);
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("v4 issuer service can also boot from an injected environment", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ckbuilder-v4-issuer-env-"));
  try {
    const env = publicInjectedEnv({
      ISSUER_NAME: "CKBuilder Test Issuer",
      ISSUER_PRIVATE_KEY_PATH: "./secrets/issuer-private.pem",
      ISSUER_PUBLIC_KEY_PATH: "./data/issuer-public.pem",
      REVOCATION_CONTRACT_BIN: "./deployment/credential-revocation",
      CKB_ISSUER_PRIVATE_KEY_FILE: "./secrets/ckb-private-key",
      OFFCKB_SYSTEM_SCRIPTS: "./deployment/system-scripts.json",
      ADMIN_EMAIL: "admin@example.invalid",
      ADMIN_PASSWORD: "correct horse battery staple",
      SESSION_SECRET: "0123456789abcdef0123456789abcdef"
    });
    const code = `import {loadEnv} from ${JSON.stringify(envModuleUrl)}; const c=loadEnv(process.argv[1]); console.log(JSON.stringify({network:c.APP_NETWORK,admin:c.ADMIN_EMAIL,key:c.ISSUER_PRIVATE_KEY_PATH}));`;
    const result = runModule(code, temp, env);
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(result.stdout.trim());
    assert.equal(config.network, "mainnet");
    assert.equal(config.admin, "admin@example.invalid");
    assert.equal(config.key, path.join(temp, "secrets", "issuer-private.pem"));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("v4 local mode still fails clearly when .env is absent and process-only mode is not enabled", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ckbuilder-v4-no-env-"));
  try {
    const env = { ...process.env };
    delete env.CKBUILDER_PROCESS_ENV_ONLY;
    const code = `import {loadPublicInspectorEnv} from ${JSON.stringify(envModuleUrl)}; try{loadPublicInspectorEnv(process.argv[1]);process.exit(3)}catch(e){console.log(e.code);process.exit(e.code==='ENV_FILE_MISSING'?0:2)}`;
    const result = runModule(code, temp, env);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "ENV_FILE_MISSING");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
