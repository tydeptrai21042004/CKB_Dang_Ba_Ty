#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../lib/env.js";
import { openProductDb, closeProductDb } from "../lib/product-db.js";
import { createIssuerServer } from "../lib/issuer-http.js";
import { rootDir } from "./common.js";

const config = loadEnv(rootDir());
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../issuer-public");
const db = openProductDb(config.PRODUCT_DB_PATH);
const port = Number(process.env.ISSUER_PORTAL_PORT ?? config.ISSUER_PORTAL_PORT ?? 4273);
const host = process.env.ISSUER_PORTAL_HOST ?? config.ISSUER_PORTAL_HOST ?? "127.0.0.1";
const server = createIssuerServer({ config, publicDir, db });
server.listen(port, host, () => {
  console.log(`CKBuilder Issuer Portal: http://${host}:${port}`);
  console.log(`Network: ${config.APP_NETWORK}; chain writes: ${config.CHAIN_WRITE_MODE}`);
  console.log("This process loads issuer signing keys. Keep it private and authenticated.");
});
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { closeProductDb(db); server.close(() => process.exit(0)); });
