import fs from "node:fs";
import path from "node:path";
import { AppError } from "./errors.js";

const REQUIRED_KEYS = [
  "APP_NETWORK",
  "CKB_RPC_URL",
  "ISSUER_NAME",
  "ISSUER_LOCK_HASH",
  "DATA_DIR",
  "ISSUER_PRIVATE_KEY_PATH",
  "ISSUER_PUBLIC_KEY_PATH",
  "TRUSTED_ISSUERS_FILE",
  "REVOCATION_CONTRACT_BIN",
  "CKB_ISSUER_PRIVATE_KEY_FILE",
  "OFFCKB_SYSTEM_SCRIPTS",
  "OFFCKB_DEPLOYMENT_SCRIPTS",
  "OFFCKB_CHAIN_STATE"
];

const PUBLIC_INSPECTOR_REQUIRED_KEYS = [
  "APP_NETWORK",
  "CKB_RPC_URL",
  "ISSUER_LOCK_HASH",
  "DATA_DIR",
  "TRUSTED_ISSUERS_FILE",
  "OFFCKB_SYSTEM_SCRIPTS",
  "OFFCKB_DEPLOYMENT_SCRIPTS",
  "OFFCKB_CHAIN_STATE"
];

export function parseEnvText(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function readMergedEnv(rootDir, options = {}) {
  const envPath = path.join(rootDir, options.filename ?? ".env");
  if (!fs.existsSync(envPath)) {
    if (String(process.env.CKBUILDER_PROCESS_ENV_ONLY ?? "0") === "1") return { ...process.env };
    throw new AppError("ENV_FILE_MISSING", `Missing ${envPath}. Copy .env.example to .env first, or set CKBUILDER_PROCESS_ENV_ONLY=1 for an injected production environment.`);
  }
  const fileValues = parseEnvText(fs.readFileSync(envPath, "utf8"));
  return { ...fileValues, ...process.env };
}

export function loadEnv(rootDir = process.cwd(), options = {}) {
  const merged = readMergedEnv(rootDir, options);
  validateEnv(merged);
  return resolveEnvPaths(merged, rootDir);
}

/**
 * Load only the settings required by the read-only Public Credential Inspector.
 * Private-key paths are intentionally not required or resolved here.
 */
export function loadPublicInspectorEnv(rootDir = process.cwd(), options = {}) {
  const merged = readMergedEnv(rootDir, options);
  validatePublicInspectorEnv(merged);
  return resolvePublicEnvPaths(merged, rootDir);
}

function validateRequired(env, requiredKeys) {
  const missing = requiredKeys.filter((key) => typeof env[key] !== "string" || env[key].trim() === "");
  if (missing.length > 0) {
    throw new AppError("ENV_VALUES_MISSING", "Required environment values are missing.", { missing });
  }
}

function validateCommon(env) {
  if (!new Set(["local", "devnet", "testnet", "mainnet"]).has(env.APP_NETWORK)) {
    throw new AppError("ENV_NETWORK_INVALID", "APP_NETWORK must be local, devnet, testnet, or mainnet.");
  }

  try {
    const rpc = new URL(env.CKB_RPC_URL);
    if (!new Set(["http:", "https:"]).has(rpc.protocol)) throw new Error("invalid protocol");
  } catch {
    throw new AppError("ENV_RPC_INVALID", "CKB_RPC_URL must be a valid HTTP or HTTPS URL.");
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(env.ISSUER_LOCK_HASH)) {
    throw new AppError("ENV_LOCK_HASH_INVALID", "ISSUER_LOCK_HASH must be 0x followed by exactly 64 hexadecimal characters.");
  }

  if (!["0", "1"].includes(String(env.REQUIRE_CKB_RPC ?? "0"))) {
    throw new AppError("ENV_RPC_FLAG_INVALID", "REQUIRE_CKB_RPC must be 0 or 1.");
  }

  if (!["0", "1"].includes(String(env.TRUST_PROXY ?? "0"))) {
    throw new AppError("ENV_PROXY_FLAG_INVALID", "TRUST_PROXY must be 0 or 1.");
  }

  if (!["disabled", "optional", "required"].includes(String(env.CHAIN_WRITE_MODE ?? "optional"))) {
    throw new AppError("ENV_CHAIN_WRITE_MODE_INVALID", "CHAIN_WRITE_MODE must be disabled, optional, or required.");
  }
}

export function validateEnv(env) {
  validateRequired(env, REQUIRED_KEYS);
  validateCommon(env);
}

export function validatePublicInspectorEnv(env) {
  validateRequired(env, PUBLIC_INSPECTOR_REQUIRED_KEYS);
  validateCommon(env);
}

function resolveEnvPaths(env, rootDir) {
  const resolve = (value) => path.resolve(rootDir, value);
  return {
    ...env,
    ROOT_DIR: rootDir,
    DATA_DIR: resolve(env.DATA_DIR),
    ISSUER_PRIVATE_KEY_PATH: resolve(env.ISSUER_PRIVATE_KEY_PATH),
    ISSUER_PUBLIC_KEY_PATH: resolve(env.ISSUER_PUBLIC_KEY_PATH),
    TRUSTED_ISSUERS_FILE: resolve(env.TRUSTED_ISSUERS_FILE),
    REVOCATION_CONTRACT_BIN: resolve(env.REVOCATION_CONTRACT_BIN),
    CKB_ISSUER_PRIVATE_KEY_FILE: resolve(env.CKB_ISSUER_PRIVATE_KEY_FILE),
    OFFCKB_SYSTEM_SCRIPTS: resolve(env.OFFCKB_SYSTEM_SCRIPTS),
    OFFCKB_DEPLOYMENT_SCRIPTS: resolve(env.OFFCKB_DEPLOYMENT_SCRIPTS),
    OFFCKB_CHAIN_STATE: resolve(env.OFFCKB_CHAIN_STATE),
    REQUIRE_CKB_RPC: String(env.REQUIRE_CKB_RPC ?? "0") === "1",
    TRUST_PROXY: String(env.TRUST_PROXY ?? "0") === "1",
    FIBER_RPC_URL: env.FIBER_RPC_URL ?? "",
    CKB_AGENT_WORKSPACE: env.CKB_AGENT_WORKSPACE ? resolve(env.CKB_AGENT_WORKSPACE) : "",
    CKB_GITHUB_TOKEN: env.CKB_GITHUB_TOKEN ?? "",
    PRODUCT_DB_PATH: resolve(env.PRODUCT_DB_PATH ?? "./data/ckbuilder-passport.sqlite"),
    PUBLIC_BASE_URL: env.PUBLIC_BASE_URL ?? "http://127.0.0.1:4173",
    PUBLIC_APP_NAME: env.PUBLIC_APP_NAME ?? "CKBuilder Passport",
    AI_ENABLED: String(env.AI_ENABLED ?? "1") !== "0",
    AI_DEFAULT_PROVIDER: env.AI_DEFAULT_PROVIDER ?? "openai",
    AI_DEFAULT_MODEL: env.AI_DEFAULT_MODEL ?? "gpt-4.1-mini",
    CHAIN_WRITE_MODE: env.CHAIN_WRITE_MODE ?? "optional",
    ADMIN_EMAIL: env.ADMIN_EMAIL,
    ADMIN_PASSWORD: env.ADMIN_PASSWORD,
    SESSION_SECRET: env.SESSION_SECRET,
    PUBLIC_DIRECTORY_ENABLED: String(env.PUBLIC_DIRECTORY_ENABLED ?? "0") === "1",
    WEBHOOK_URL: env.WEBHOOK_URL ?? "",
    WEBHOOK_SECRET: env.WEBHOOK_SECRET ?? ""
  };
}

function resolvePublicEnvPaths(env, rootDir) {
  const resolve = (value) => path.resolve(rootDir, value);
  // Deliberately whitelist public settings. Even when the full .env contains
  // private-key paths, they are not returned to the inspector process.
  return {
    ROOT_DIR: rootDir,
    APP_NETWORK: env.APP_NETWORK,
    CKB_RPC_URL: env.CKB_RPC_URL,
    FIBER_RPC_URL: env.FIBER_RPC_URL ?? "",
    CKB_AGENT_WORKSPACE: env.CKB_AGENT_WORKSPACE ? resolve(env.CKB_AGENT_WORKSPACE) : "",
    CKB_GITHUB_TOKEN: env.CKB_GITHUB_TOKEN ?? "",
    ISSUER_LOCK_HASH: env.ISSUER_LOCK_HASH,
    DATA_DIR: resolve(env.DATA_DIR),
    TRUSTED_ISSUERS_FILE: resolve(env.TRUSTED_ISSUERS_FILE),
    OFFCKB_SYSTEM_SCRIPTS: resolve(env.OFFCKB_SYSTEM_SCRIPTS),
    OFFCKB_DEPLOYMENT_SCRIPTS: resolve(env.OFFCKB_DEPLOYMENT_SCRIPTS),
    OFFCKB_CHAIN_STATE: resolve(env.OFFCKB_CHAIN_STATE),
    REQUIRE_CKB_RPC: String(env.REQUIRE_CKB_RPC ?? "0") === "1",
    TRUST_PROXY: String(env.TRUST_PROXY ?? "0") === "1",
    PRODUCT_DB_PATH: resolve(env.PRODUCT_DB_PATH ?? "./data/ckbuilder-passport.sqlite"),
    PUBLIC_BASE_URL: env.PUBLIC_BASE_URL ?? "http://127.0.0.1:4173",
    PUBLIC_APP_NAME: env.PUBLIC_APP_NAME ?? "CKBuilder Passport",
    AI_ENABLED: String(env.AI_ENABLED ?? "1") !== "0",
    AI_DEFAULT_PROVIDER: env.AI_DEFAULT_PROVIDER ?? "openai",
    AI_DEFAULT_MODEL: env.AI_DEFAULT_MODEL ?? "gpt-4.1-mini",
    PUBLIC_DIRECTORY_ENABLED: String(env.PUBLIC_DIRECTORY_ENABLED ?? "0") === "1"
  };
}
