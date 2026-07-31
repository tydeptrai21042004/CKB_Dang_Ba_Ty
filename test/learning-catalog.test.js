import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildLearningOverview } from "../src/lib/learning-progress.js";
import { validateQuiz } from "../src/lib/learning-quiz.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "learning", "catalog.json"), "utf8"));

test("learning catalog exposes all five official beginner tutorials", () => {
  assert.equal(catalog.schema, "ckbuilder-learning-catalog/v2");
  assert.deepEqual(catalog.basicTutorials.map((item) => item.id), [
    "transfer-ckb",
    "store-data-on-cell",
    "create-fungible-token",
    "create-dob",
    "build-simple-lock"
  ]);
});

test("every tutorial uses HTTPS and has three or more screenshot requirements", () => {
  for (const tutorial of catalog.basicTutorials) {
    assert.match(tutorial.url, /^https:\/\//);
    assert.ok(tutorial.screenshots.length >= 3, tutorial.id);
    assert.match(tutorial.completionFile, /^learning\/basic-exercises\//);
  }
});

test("every tutorial has an evidence template but no fabricated completion file", () => {
  for (const tutorial of catalog.basicTutorials) {
    const directory = path.dirname(path.join(root, tutorial.completionFile));
    assert.equal(fs.existsSync(path.join(directory, "EVIDENCE_TEMPLATE.md")), true);
    assert.equal(fs.existsSync(path.join(root, tutorial.completionFile)), false);
  }
});

test("resource catalog covers CCC, SDKs, developer tools, Fiber, and Perun", () => {
  const groups = Object.fromEntries(catalog.resourceGroups.map((group) => [group.id, group]));
  for (const id of ["ccc", "languages", "devtools", "payment-channels"]) assert.ok(groups[id]);
  const paymentTitles = groups["payment-channels"].items.map((item) => item.title).join(" ");
  assert.match(paymentTitles, /Fiber/);
  assert.match(paymentTitles, /Perun/);
});

test("all resource links are HTTPS and uniquely titled within a group", () => {
  for (const group of catalog.resourceGroups) {
    assert.equal(new Set(group.items.map((item) => item.title)).size, group.items.length);
    for (const item of group.items) assert.match(item.url, /^https:\/\//);
  }
});

test("screenshot policy explicitly blocks secret capture", () => {
  assert.ok(catalog.screenshotPolicy.minimumPerTutorial >= 3);
  assert.match(catalog.screenshotPolicy.neverCapture.join(" "), /Private keys/);
  assert.match(catalog.screenshotPolicy.neverCapture.join(" "), /Seed phrases/);
});

test("structured curriculum contains fourteen ordered, unique modules", () => {
  assert.equal(catalog.curriculumModules.length, 14);
  assert.equal(new Set(catalog.curriculumModules.map((module) => module.id)).size, 14);
  assert.deepEqual(catalog.curriculumModules.map((module) => module.sequence), Array.from({ length: 14 }, (_, index) => index + 1));
  assert.ok(new Set(catalog.curriculumModules.map((module) => module.category)).size >= 6);
});

test("curriculum prerequisites reference earlier modules only", () => {
  const seen = new Set();
  for (const module of catalog.curriculumModules) {
    for (const prerequisite of module.prerequisites) assert.ok(seen.has(prerequisite), `${module.id} has unresolved prerequisite ${prerequisite}`);
    seen.add(module.id);
  }
});

test("every curriculum module has lesson, quiz, evidence template, and no fabricated completion", () => {
  for (const module of catalog.curriculumModules) {
    for (const key of ["lessonFile", "quizFile", "evidenceTemplate"]) {
      assert.equal(fs.existsSync(path.join(root, module[key])), true, `${module.id} missing ${key}`);
    }
    assert.equal(fs.existsSync(path.join(root, module.completionFile)), false, `${module.id} must not be pre-completed`);
    assert.ok(module.outcomes.length >= 3);
    assert.ok(module.checkpoints.length >= 3);
    assert.ok(module.commands.length >= 1);
    for (const reference of module.references) assert.match(reference.url, /^https:\/\//);
  }
});

test("every curriculum quiz is structurally valid", () => {
  for (const module of catalog.curriculumModules) {
    const quiz = JSON.parse(fs.readFileSync(path.join(root, module.quizFile), "utf8"));
    assert.equal(validateQuiz(quiz), quiz);
    assert.equal(quiz.moduleId, module.id);
    assert.equal(quiz.questions.length, 3);
  }
});

test("study plan support files are present", () => {
  for (const key of ["path", "devLogTemplate", "capstoneTemplate", "glossary"]) {
    assert.equal(fs.existsSync(path.join(root, catalog.studyPlan[key])), true, key);
  }
});

test("learning overview exposes tutorials and curriculum without counting templates as completion", () => {
  const overview = buildLearningOverview(root);
  const basic = overview.tracks.find((track) => track.id === "basic-tutorials");
  const ccc = overview.tracks.find((track) => track.id === "ccc-learning");
  const curriculum = overview.tracks.find((track) => track.id === "structured-curriculum");
  assert.equal(basic.completed, 0);
  assert.equal(basic.total, 5);
  assert.equal(ccc.completed, 0);
  assert.equal(curriculum.completed, 0);
  assert.equal(curriculum.total, 14);
  assert.equal(overview.tutorials.length, 5);
  assert.equal(overview.curriculum.length, 14);
  assert.equal(overview.resourceGroups.length, 4);
});
