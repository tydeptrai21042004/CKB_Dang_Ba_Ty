#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCommunityPluginManifest } from "../src/lib/plugin-service.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "plugins", "community");
let failures = 0;
let checked = 0;
for (const name of fs.readdirSync(dir).filter((file) => file.endsWith(".json")).sort()) {
  checked += 1;
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    const plugin = validateCommunityPluginManifest(parsed, name);
    console.log(`OK  ${name}${plugin ? ` -> ${plugin.id} (${plugin.endpoint})` : " (disabled template)"}`);
  } catch (error) {
    failures += 1;
    console.error(`ERR ${name}: ${error?.message ?? error}`);
  }
}
if (!checked) console.log("No community plugin manifests found.");
if (failures) process.exitCode = 1;
else console.log(`Validated ${checked} community plugin manifest(s).`);
