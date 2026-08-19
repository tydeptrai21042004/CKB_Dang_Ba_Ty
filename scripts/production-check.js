#!/usr/bin/env node
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { loadEnv } from "../src/lib/env.js";
import { rootDir } from "../src/cli/common.js";
import { openProductDb, closeProductDb } from "../src/lib/product-db.js";
import { validateWebhookUrl } from "../src/lib/webhook-service.js";

const issues=[]; const warnings=[];
try {
  const env=loadEnv(rootDir());
  if ((env.SESSION_SECRET??"").length<32) issues.push("SESSION_SECRET must be at least 32 characters.");
  if (env.ADMIN_PASSWORD==="change-this-before-deploy") issues.push("ADMIN_PASSWORD is still the example value.");
  if (env.SESSION_SECRET?.startsWith("change-this")) issues.push("SESSION_SECRET is still the example value.");
  if (env.ADMIN_EMAIL?.endsWith("@example.com")) issues.push("ADMIN_EMAIL is still an example address.");
  if (/^0x0{64}$/i.test(env.ISSUER_LOCK_HASH)) issues.push("ISSUER_LOCK_HASH is still the all-zero placeholder.");
  if (/replace-with|\.example(?:\/|$|:)/i.test(env.CKB_RPC_URL)) issues.push("CKB_RPC_URL is still a placeholder.");
  if (/example\.com/i.test(env.PUBLIC_BASE_URL ?? "")) issues.push("PUBLIC_BASE_URL is still an example domain.");
  if (env.APP_NETWORK !== "devnet" && !String(env.PUBLIC_BASE_URL ?? "").startsWith("https://")) issues.push("External deployments should use an HTTPS PUBLIC_BASE_URL.");
  if (env.CHAIN_WRITE_MODE==="disabled") warnings.push("CHAIN_WRITE_MODE=disabled: credentials will not be written to CKB.");
  if (env.APP_NETWORK==="mainnet" && env.CHAIN_WRITE_MODE!=="required") issues.push("Mainnet deployment should use CHAIN_WRITE_MODE=required.");
  if (env.APP_NETWORK==="mainnet" && !env.CKB_RPC_URL.startsWith("https://")) warnings.push("Mainnet RPC is not HTTPS; use a private trusted transport or HTTPS endpoint.");
  if (env.PUBLIC_DIRECTORY_ENABLED) warnings.push("PUBLIC_DIRECTORY_ENABLED=1: public credential metadata is searchable. Confirm this is intended.");
  if (env.WEBHOOK_URL) {
    try { validateWebhookUrl(env.WEBHOOK_URL); } catch (error) { issues.push(error.message); }
    if ((env.WEBHOOK_SECRET??"").length < 24) issues.push("WEBHOOK_SECRET must contain at least 24 characters when WEBHOOK_URL is configured.");
  }
  for(const f of [env.ISSUER_PRIVATE_KEY_PATH,env.ISSUER_PUBLIC_KEY_PATH]) if(!fs.existsSync(f)) warnings.push(`Issuer identity key file not present yet (issuer:init may create it): ${f}`);
  if (env.CHAIN_WRITE_MODE !== "disabled" && !fs.existsSync(env.CKB_ISSUER_PRIVATE_KEY_FILE)) issues.push(`CKB issuer signing key is missing: ${env.CKB_ISSUER_PRIVATE_KEY_FILE}`);
  const db=openProductDb(env.PRODUCT_DB_PATH); closeProductDb(db);
  const qr=spawnSync("qrencode",["--version"],{encoding:"utf8"}); if(qr.error?.code==="ENOENT") warnings.push("qrencode is not installed; QR endpoint will be unavailable. Dockerfile installs it.");
  console.log(`CKBuilder production check\nNetwork: ${env.APP_NETWORK}\nChain writes: ${env.CHAIN_WRITE_MODE}\nDatabase: ${env.PRODUCT_DB_PATH}`);
} catch(e){issues.push(e.message)}
for(const x of warnings) console.warn(`WARN: ${x}`); for(const x of issues) console.error(`ERROR: ${x}`);
if(issues.length) process.exit(1); console.log("Production configuration check passed with no blocking errors.");
