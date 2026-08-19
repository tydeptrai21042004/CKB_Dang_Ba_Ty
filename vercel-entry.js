import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPublicInspectorEnv } from "./src/lib/env.js";
import { createInspectorServer } from "./src/lib/inspector-http.js";

// Minimal Vercel adapter. It deliberately reuses the existing public server
// implementation instead of introducing a second application structure.
const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT_DIR, "public");

function setDefault(name, value) {
  if (process.env[name] === undefined || process.env[name] === "") process.env[name] = value;
}

// Vercel injects configuration through process.env; there is no checked-in .env.
setDefault("CKBUILDER_PROCESS_ENV_ONLY", "1");
setDefault("APP_NETWORK", "testnet");
setDefault("CKB_RPC_URL", "https://testnet.ckb.dev");
setDefault("REQUIRE_CKB_RPC", "0");
setDefault("TRUST_PROXY", "1");
setDefault("ISSUER_LOCK_HASH", "0x0000000000000000000000000000000000000000000000000000000000000000");
setDefault("DATA_DIR", "./data");
setDefault("TRUSTED_ISSUERS_FILE", "./data/trusted-issuers.json");
setDefault("OFFCKB_SYSTEM_SCRIPTS", "./deployment/system-scripts.json");
setDefault("OFFCKB_DEPLOYMENT_SCRIPTS", "./deployment/scripts.json");
setDefault("OFFCKB_CHAIN_STATE", "./data/offckb-chain-state.json");
setDefault("PUBLIC_APP_NAME", "CKBuilder Passport");
setDefault("AI_ENABLED", "1");
setDefault("AI_DEFAULT_PROVIDER", "openai");
setDefault("AI_DEFAULT_MODEL", "gpt-4.1-mini");
setDefault("PUBLIC_DIRECTORY_ENABLED", "1");
setDefault("CKB_AGENT_WORKSPACE", "");
setDefault("CKB_GITHUB_TOKEN", "");

if (!process.env.PUBLIC_BASE_URL) {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (host) process.env.PUBLIC_BASE_URL = `https://${host}`;
}

const config = loadPublicInspectorEnv(ROOT_DIR);
// Vercel Functions do not provide durable local SQLite/file storage. Keep the
// public deployment read-only rather than pretending submissions are persistent.
const server = createInspectorServer({
  config,
  publicDir: PUBLIC_DIR,
  productDb: null,
  maxBodyBytes: 4 * 1024 * 1024,
  maxDocumentBytes: 3 * 1024 * 1024
});
const requestListener = server.listeners("request")[0];

export default function handler(request, response) {
  return requestListener(request, response);
}
