import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gradeQuiz, listQuizzes, loadQuiz, validateQuiz } from "../src/lib/learning-quiz.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("quiz registry exposes all fourteen modules", () => {
  const quizzes = listQuizzes(root);
  assert.equal(quizzes.length, 14);
  assert.ok(quizzes.every((quiz) => quiz.questions === 3));
});

test("every quiz loads through the validated loader", () => {
  for (const item of listQuizzes(root)) {
    const quiz = loadQuiz(root, item.moduleId);
    assert.equal(validateQuiz(quiz), quiz);
    assert.equal(quiz.title, item.title);
  }
});

test("quiz grader reports a perfect answer set", () => {
  const quiz = loadQuiz(root, "ckb-foundations");
  const result = gradeQuiz(quiz, quiz.questions.map((question) => question.answerIndex));
  assert.equal(result.score, 3);
  assert.equal(result.percent, 100);
  assert.equal(result.passed, true);
  assert.ok(result.results.every((item) => item.ok));
});

test("quiz grader explains incorrect answers", () => {
  const quiz = loadQuiz(root, "ckb-foundations");
  const answers = quiz.questions.map((question) => (question.answerIndex + 1) % question.options.length);
  const result = gradeQuiz(quiz, answers);
  assert.equal(result.score, 0);
  assert.equal(result.passed, false);
  assert.ok(result.results.every((item) => item.explanation.length > 10));
});

test("quiz grader rejects missing answers", () => {
  const quiz = loadQuiz(root, "ckb-foundations");
  assert.throws(() => gradeQuiz(quiz, [0]), /Expected 3 answers/);
});

test("quiz loader rejects unsafe IDs and unknown modules", () => {
  assert.throws(() => loadQuiz(root, "../package"), /Module ID/);
  assert.throws(() => loadQuiz(root, "not-a-module"), /No quiz found/);
});

test("quiz CLI lists the full learning path", () => {
  const result = spawnSync(process.execPath, ["scripts/run-learning-quiz.js", "--list"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ckb-foundations/);
  assert.match(result.stdout, /capstone-planning/);
});

test("quiz CLI supports deterministic non-interactive grading", () => {
  const quiz = loadQuiz(root, "capacity-and-data");
  const answers = quiz.questions.map((question) => question.answerIndex).join(",");
  const result = spawnSync(process.execPath, ["scripts/run-learning-quiz.js", "capacity-and-data", "--answers", answers], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /3\/3 correct \(100%\)/);
});
