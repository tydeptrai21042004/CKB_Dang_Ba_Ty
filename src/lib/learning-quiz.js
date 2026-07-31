import fs from "node:fs";
import path from "node:path";
import { AppError } from "./errors.js";

export function validateQuiz(quiz) {
  if (!quiz || quiz.schema !== "ckbuilder-learning-quiz/v1") throw new AppError("LEARNING_QUIZ_INVALID", "Unsupported learning quiz schema.");
  if (!/^[a-z0-9-]+$/.test(quiz.moduleId ?? "")) throw new AppError("LEARNING_QUIZ_INVALID", "Quiz moduleId is invalid.");
  if (!Array.isArray(quiz.questions) || quiz.questions.length < 3) throw new AppError("LEARNING_QUIZ_INVALID", "A quiz must contain at least three questions.");
  const ids = new Set();
  for (const question of quiz.questions) {
    if (!question.id || ids.has(question.id)) throw new AppError("LEARNING_QUIZ_INVALID", "Quiz question IDs must be unique.");
    ids.add(question.id);
    if (typeof question.prompt !== "string" || question.prompt.trim().length < 8) throw new AppError("LEARNING_QUIZ_INVALID", `Question ${question.id} has no usable prompt.`);
    if (!Array.isArray(question.options) || question.options.length < 2 || question.options.some((option) => typeof option !== "string" || !option.trim())) {
      throw new AppError("LEARNING_QUIZ_INVALID", `Question ${question.id} must have at least two non-empty options.`);
    }
    if (!Number.isInteger(question.answerIndex) || question.answerIndex < 0 || question.answerIndex >= question.options.length) {
      throw new AppError("LEARNING_QUIZ_INVALID", `Question ${question.id} has an invalid answerIndex.`);
    }
    if (typeof question.explanation !== "string" || !question.explanation.trim()) throw new AppError("LEARNING_QUIZ_INVALID", `Question ${question.id} needs an explanation.`);
  }
  return quiz;
}

export function loadQuiz(rootDir, moduleId) {
  if (!/^[a-z0-9-]+$/.test(moduleId ?? "")) throw new AppError("LEARNING_QUIZ_ID_INVALID", "Module ID may contain lowercase letters, numbers, and hyphens only.");
  const quizPath = path.join(rootDir, "learning", "curriculum", moduleId, "QUIZ.json");
  if (!fs.existsSync(quizPath)) throw new AppError("LEARNING_QUIZ_NOT_FOUND", `No quiz found for ${moduleId}.`);
  try {
    return validateQuiz(JSON.parse(fs.readFileSync(quizPath, "utf8")));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("LEARNING_QUIZ_INVALID", `Cannot read quiz for ${moduleId}.`, { cause: error instanceof Error ? error.message : String(error) });
  }
}

export function listQuizzes(rootDir) {
  const directory = path.join(rootDir, "learning", "curriculum");
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(directory, entry.name, "QUIZ.json")))
    .map((entry) => loadQuiz(rootDir, entry.name))
    .map((quiz) => ({ moduleId: quiz.moduleId, title: quiz.title, questions: quiz.questions.length }))
    .sort((a, b) => a.moduleId.localeCompare(b.moduleId));
}

export function gradeQuiz(quiz, answers) {
  validateQuiz(quiz);
  if (!Array.isArray(answers) || answers.length !== quiz.questions.length) {
    throw new AppError("LEARNING_QUIZ_ANSWERS_INVALID", `Expected ${quiz.questions.length} answers.`);
  }
  const results = quiz.questions.map((question, index) => {
    const answerIndex = Number(answers[index]);
    const validIndex = Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < question.options.length;
    return {
      id: question.id,
      prompt: question.prompt,
      answerIndex: validIndex ? answerIndex : null,
      correctIndex: question.answerIndex,
      selected: validIndex ? question.options[answerIndex] : null,
      correct: question.options[question.answerIndex],
      ok: validIndex && answerIndex === question.answerIndex,
      explanation: question.explanation
    };
  });
  const score = results.filter((result) => result.ok).length;
  return { moduleId: quiz.moduleId, title: quiz.title, score, total: results.length, percent: Math.round(score / results.length * 100), passed: score === results.length, results };
}
