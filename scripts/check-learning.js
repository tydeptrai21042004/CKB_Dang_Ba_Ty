#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildLearningOverview } from "../src/lib/learning-progress.js";
import { listQuizzes } from "../src/lib/learning-quiz.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireRust = process.argv.includes("--require-rust");
const overview = buildLearningOverview(root);
const failures = [];
const quizzes = listQuizzes(root);

if (overview.validation.rustSourceFiles !== 22) {
  failures.push(`Expected 22 included Rustlings sources, found ${overview.validation.rustSourceFiles}.`);
}
if (!overview.validation.rustSolutionsClean) {
  failures.push(`Unresolved markers remain in: ${overview.validation.unresolvedRustFiles.join(", ")}`);
}
if (overview.curriculum.length !== 14) {
  failures.push(`Expected 14 curriculum modules, found ${overview.curriculum.length}.`);
}
if (quizzes.length !== 14 || quizzes.some((quiz) => quiz.questions !== 3)) {
  failures.push(`Expected 14 validated three-question quizzes, found ${quizzes.length}.`);
}
for (const module of overview.curriculum) {
  for (const field of ["lessonFile", "quizFile", "evidenceTemplate"]) {
    if (!fs.existsSync(path.join(root, module[field]))) failures.push(`${module.id} is missing ${field}.`);
  }
}

const rustc = spawnSync("rustc", ["--version"], { encoding: "utf8" });
let compiled = 0;
if (rustc.status === 0) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ckbuilder-learning-"));
  try {
    const rustRoot = path.join(root, "learning", "rustlings-solved");
    const stack = [rustRoot];
    const sources = [];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const absolute = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(absolute);
        if (entry.isFile() && entry.name.endsWith(".rs")) sources.push(absolute);
      }
    }

    for (const [index, source] of sources.sort().entries()) {
      const text = fs.readFileSync(source, "utf8");
      const output = path.join(temp, `exercise-${index}`);
      const args = text.includes("#[cfg(test)]")
        ? ["--edition=2021", "--test", source, "-o", output]
        : ["--edition=2021", source, "-o", output];
      const result = spawnSync("rustc", args, { encoding: "utf8" });
      if (result.status !== 0) {
        failures.push(`${path.relative(root, source)} failed Rust compilation:\n${result.stderr.trim()}`);
      } else {
        compiled += 1;
        if (text.includes("#[cfg(test)]")) {
          const testResult = spawnSync(output, [], { encoding: "utf8" });
          if (testResult.status !== 0) {
            failures.push(`${path.relative(root, source)} compiled but its tests failed:\n${testResult.stdout}${testResult.stderr}`);
          }
        }
      }
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
} else if (requireRust) {
  failures.push("rustc is required but was not found on PATH.");
}

console.log(`Learning evidence: ${overview.summary.completed}/${overview.summary.total} tracked items (${overview.summary.percent}%).`);
for (const track of overview.tracks) {
  console.log(`- ${track.label}: ${track.completed}/${track.total} [${track.state}]`);
}
console.log(`Curriculum validation: ${overview.curriculum.length} modules and ${quizzes.length} quizzes available.`);
console.log(rustc.status === 0
  ? `Rust validation: ${compiled}/${overview.validation.rustSourceFiles} sources compiled successfully.`
  : "Rust validation: rustc unavailable; deterministic source checks passed.");

if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exitCode = 1;
}
