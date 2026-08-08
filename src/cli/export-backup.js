#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "../lib/env.js";
import { openProductDb, closeProductDb, exportOperationalSnapshot } from "../lib/product-db.js";
import { loadLedger } from "../lib/ledger.js";
import { rootDir } from "./common.js";

const config = loadEnv(rootDir());
const destination = path.resolve(process.argv[2] || path.join(config.DATA_DIR, "backups", `ckbuilder-${new Date().toISOString().replace(/[:.]/g, "-")}.json`));
const db = openProductDb(config.PRODUCT_DB_PATH);
try {
  const snapshot = {
    schema: "ckbuilder-backup/v1",
    exportedAt: new Date().toISOString(),
    network: config.APP_NETWORK,
    product: exportOperationalSnapshot(db),
    ledger: loadLedger(config.DATA_DIR)
  };
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
  console.log(destination);
} finally { closeProductDb(db); }
