#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildCkbCapacityTransferIntent } from "../lib/agent-ops-service.js";

const file = process.argv[2];
if (!file) { console.error("Usage: npm run agent:tx:build -- <builder-input.json>"); process.exit(2); }
try {
  const input = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  console.log(JSON.stringify(buildCkbCapacityTransferIntent(input), null, 2));
} catch (error) {
  console.error(`[${error.code ?? "CKB_TX_BUILD_FAILED"}] ${error.message}`);
  process.exit(1);
}
