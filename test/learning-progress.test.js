import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildLearningOverview } from "../src/lib/learning-progress.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("learning overview reports completed source work without inventing missing evidence", () => {
  const overview = buildLearningOverview(root);
  const byId = Object.fromEntries(overview.tracks.map((track) => [track.id, track]));

  assert.equal(overview.schema, "ckbuilder-learning-progress/v1");
  assert.equal(byId.rustlings.completed, 22);
  assert.equal(byId.rustlings.state, "complete");
  assert.equal(byId.academy.completed, 0);
  assert.equal(byId["ccc-learning"].completed, 0);
  assert.equal(byId["basic-tutorials"].completed, 0);
  assert.equal(byId["cell-model"].completed, 0);
  assert.equal(byId["structured-curriculum"].completed, 0);
  assert.equal(overview.validation.rustSolutionsClean, true);
  assert.equal(overview.summary.completed, 22);
  assert.equal(overview.summary.total, 61);
});

test("curriculum summary recommends the first available incomplete module", () => {
  const overview = buildLearningOverview(root);
  assert.equal(overview.curriculumSummary.total, 14);
  assert.equal(overview.curriculumSummary.completed, 0);
  assert.equal(overview.curriculumSummary.percent, 0);
  assert.equal(overview.curriculumSummary.nextModule.id, "ckb-foundations");
  assert.ok(overview.curriculumSummary.estimatedMinutes >= 700);
  assert.ok(overview.curriculumSummary.categories.length >= 6);
});

test("curriculum states preserve prerequisite guidance without hiding modules", () => {
  const overview = buildLearningOverview(root);
  const byId = Object.fromEntries(overview.curriculum.map((module) => [module.id, module]));
  assert.equal(byId["ckb-foundations"].state, "available");
  assert.equal(byId["capacity-and-data"].state, "planned");
  assert.deepEqual(byId["capacity-and-data"].missingPrerequisites, ["ckb-foundations"]);
  assert.equal(byId["ckb-foundations"].quizCommand, "npm run learning:quiz -- ckb-foundations");
});
