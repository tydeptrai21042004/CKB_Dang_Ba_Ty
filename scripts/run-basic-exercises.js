#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBasicExerciseSuite } from "../src/lib/basic-exercises.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const writeEvidence = process.argv.includes("--write-evidence");
const suite = runBasicExerciseSuite();
const output = {
  ...suite,
  generatedAt: new Date().toISOString(),
  warning: "Passing this local suite proves the included learning models run. It does not prove completion of the official on-chain tutorials."
};

console.log(`Basic exercise suite: ${suite.exercises.filter((item) => item.passed).length}/${suite.exercises.length} passed.`);
for (const exercise of suite.exercises) {
  console.log(`- ${exercise.id}: ${exercise.passed ? "PASS" : "FAIL"}`);
}

if (writeEvidence) {
  const directory = path.join(root, "evidence", "generated");
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, "basic-exercises-run.json");
  fs.writeFileSync(filePath, `${JSON.stringify(output, (_key, value) => typeof value === "bigint" ? value.toString() : value, 2)}\n`, { mode: 0o600 });
  console.log(`Wrote local run evidence: ${path.relative(root, filePath)}`);
}

if (!suite.passed) process.exitCode = 1;
