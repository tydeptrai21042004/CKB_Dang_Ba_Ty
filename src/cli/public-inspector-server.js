#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPublicInspectorEnv } from "../lib/env.js";
import { createInspectorServer } from "../lib/inspector-http.js";
import { openProductDb, closeProductDb } from "../lib/product-db.js";
import { rootDir } from "./common.js";

const config = loadPublicInspectorEnv(rootDir());
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public");
const port = Number(process.env.INSPECTOR_PORT ?? 4173);
const host = process.env.INSPECTOR_HOST ?? "127.0.0.1";
const maxBodyBytes = Number(process.env.INSPECTOR_MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024);

const productDb = openProductDb(config.PRODUCT_DB_PATH);
const server = createInspectorServer({ config, publicDir, maxBodyBytes, productDb });
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { closeProductDb(productDb); server.close(() => process.exit(0)); });
server.listen(port, host, () => {
  console.log(`CKBuilder Passport public service: http://${host}:${port}`);
  console.log(`Network: ${config.APP_NETWORK}`);
  console.log("Read-only service: no issuer private key is loaded.");
});
