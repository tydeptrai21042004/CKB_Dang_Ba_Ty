#!/usr/bin/env node
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadQuiz, listQuizzes, gradeQuiz } from "../src/lib/learning-quiz.js";

const root = process.cwd();
const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--list")) {
  console.log("Available learning quizzes:\n");
  for (const quiz of listQuizzes(root)) console.log(`- ${quiz.moduleId}: ${quiz.title} (${quiz.questions} questions)`);
  console.log("\nRun: npm run learning:quiz -- <module-id>");
  process.exit(0);
}

const moduleId = args.find((value) => !value.startsWith("--"));
const quiz = loadQuiz(root, moduleId);
const answerFlag = args.indexOf("--answers");
let answers;
if (answerFlag >= 0) {
  answers = String(args[answerFlag + 1] ?? "").split(",").filter(Boolean).map((value) => Number(value));
} else {
  const rl = readline.createInterface({ input, output });
  answers = [];
  console.log(`\n${quiz.title}\n`);
  for (const [index, question] of quiz.questions.entries()) {
    console.log(`${index + 1}. ${question.prompt}`);
    question.options.forEach((option, optionIndex) => console.log(`   ${optionIndex + 1}) ${option}`));
    let selected;
    while (!Number.isInteger(selected) || selected < 0 || selected >= question.options.length) {
      const raw = await rl.question("Your answer: ");
      selected = Number(raw) - 1;
      if (!Number.isInteger(selected) || selected < 0 || selected >= question.options.length) console.log("Choose one of the listed numbers.");
    }
    answers.push(selected);
    console.log();
  }
  rl.close();
}

const result = gradeQuiz(quiz, answers);
console.log(`${result.score}/${result.total} correct (${result.percent}%)`);
for (const item of result.results) {
  console.log(`${item.ok ? "PASS" : "REVIEW"} ${item.id}: ${item.explanation}`);
}
if (!result.passed) console.log("\nReview the lesson and try again. Quiz results are not counted as official completion evidence.");
