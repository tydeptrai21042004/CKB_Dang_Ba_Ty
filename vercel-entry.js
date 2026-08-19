import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPublicInspectorEnv } from "./src/lib/env.js";
import { createInspectorServer } from "./src/lib/inspector-http.js";

// Minimal Vercel adapter. It deliberately reuses the existing public server
// implementation instead of introducing a second application structure.
const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const AGENT_RUNTIME_DIR = "/tmp/ckbuilder-agent-runtime";

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

function hasDeploymentMetadata(network) {
  try {
    const file = path.join(ROOT_DIR, "deployment", "scripts.json");
    const deployments = JSON.parse(fs.readFileSync(file, "utf8"));
    const contract = deployments?.[network]?.["credential-revocation"];
    return Boolean(contract?.codeHash && contract?.hashType && Array.isArray(contract?.cellDeps) && contract.cellDeps.length);
  } catch {
    return false;
  }
}

// The repository currently ships devnet contract metadata. A Testnet/Mainnet
// Vercel deployment should not pretend live chain inspection is configured
// until the matching deployment metadata is added. Set CHAIN_INSPECTION_ENABLED
// explicitly only after deployment/scripts.json contains that network entry.
const chainMetadataAvailable = hasDeploymentMetadata(config.APP_NETWORK);
const requestedChainInspection = String(process.env.CHAIN_INSPECTION_ENABLED ?? (chainMetadataAvailable ? "1" : "0")) === "1";
const chainInspectionEnabled = requestedChainInspection && chainMetadataAvailable;

// Vercel Functions do not provide durable local SQLite/file storage. Keep the
// public deployment read-only rather than pretending submissions are persistent.
const server = createInspectorServer({
  config,
  publicDir: PUBLIC_DIR,
  productDb: null,
  maxBodyBytes: 4 * 1024 * 1024,
  maxDocumentBytes: 3 * 1024 * 1024,
  qrEnabled: false,
  chainInspectionEnabled,
  agentJobStoreEnabled: false,
  agentRuntimeDataDir: AGENT_RUNTIME_DIR,
  deploymentTarget: "vercel"
});
const requestListener = server.listeners("request")[0];

export default function handler(request, response) {
  return requestListener(request, response);
}
