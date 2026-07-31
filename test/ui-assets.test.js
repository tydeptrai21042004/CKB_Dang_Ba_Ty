import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "public", "styles.css"), "utf8");

test("dashboard exposes every read-only workspace and learning view", () => {
  for (const view of ["overview", "inspector", "decoder", "proof", "learning"]) {
    assert.match(html, new RegExp(`id="view-${view}"`));
    assert.match(html, new RegExp(`data-view="${view}"`));
  }
  assert.match(app, /getJson\("\/api\/health"\)/);
  assert.match(app, /getJson\("\/api\/learning"\)/);
  assert.match(html, /id="tutorial-list"/);
  assert.match(html, /id="resource-groups"/);
  assert.match(html, /id="screenshot-policy"/);
});

test("learning UI has roadmap search, filters, next-module guidance, and details dialog", () => {
  for (const id of ["curriculum-search", "curriculum-filters", "curriculum-grid", "next-module-button", "lesson-dialog"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /renderCurriculum/);
  assert.match(app, /openLessonDialog/);
  assert.match(app, /activeCurriculumCategory/);
  assert.match(css, /\.curriculum-grid/);
  assert.match(css, /\.lesson-dialog/);
});

test("dashboard supports persisted light and dark themes", () => {
  assert.match(html, /id="theme-toggle"/);
  assert.match(app, /ckbuilder-theme/);
  assert.match(app, /prefers-color-scheme/);
  assert.match(css, /:root\[data-theme="dark"\]/);
});

test("learning commands are copyable without unsafe HTML rendering", () => {
  assert.match(html, /data-copy="npm run learning:quiz:list"/);
  assert.match(app, /navigator\.clipboard\.writeText/);
  assert.doesNotMatch(app, /\.innerHTML\s*=/);
});

test("dashboard IDs are unique and dynamic errors are rendered as text", () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "HTML IDs must be unique");
  assert.doesNotMatch(app, /\.innerHTML\s*=/);
});
