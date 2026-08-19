import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(repoRoot, "public", "index.html"), "utf8");
const css = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");
const app = fs.readFileSync(path.join(repoRoot, "public", "app.js"), "utf8");

test("production UI uses restrained product copy instead of generated marketing language", () => {
  assert.match(html, /Verify credentials and inspect CKB-backed builder activity/);
  assert.match(html, /Run a defined CKB workflow/);
  assert.match(html, /Run checkpointed CKB agent workflows with verifiable receipts/);
  for (const stale of [
    "Agent Economy + Mission Control",
    "Start with a CKB job, not an empty chatbot",
    "Advanced agent workbench",
    "Delegate work, simulate payment, keep a verifiable receipt"
  ]) assert.equal(html.includes(stale), false, `stale AI-slop copy remains: ${stale}`);
});

test("production UI groups navigation around core, tools, and operations", () => {
  for (const label of ["Core", "Tools", "Operations", "Agent services", "Workflows", "Custom analysis", "Model access"]) assert.match(html, new RegExp(`>${label}<`));
  for (const target of ["agent-economy-hub", "ckb-mission-control", "ai-agent-panel", "ai-settings-panel"]) assert.match(html, new RegExp(`data-scroll="${target}"`));
});

test("production UI ships explicit browser metadata and a final visual override layer", () => {
  assert.match(html, /<meta name="theme-color" content="#111915">/);
  assert.match(html, /<meta name="color-scheme" content="light dark">/);
  assert.match(html, /<title>CKBuilder Passport — CKB Credential Verification<\/title>/);
  const marker = css.indexOf("v10.2 production UI pass");
  assert.ok(marker > 0);
  const productionCss = css.slice(marker);
  assert.match(productionCss, /\.hero-card\s*\{[\s\S]*background:\s*#fff;/);
  assert.match(productionCss, /\.application-card:hover\s*\{[^}]*transform:\s*none;/);
  assert.match(productionCss, /\.view\s*\{[^}]*animation:\s*none;/);
});

test("workflow cards expose concise status and stage language", () => {
  assert.match(app, /badge\.textContent = app\.ready \? "Ready" : "Needs configuration"/);
  assert.match(app, /workflow\.textContent = `Stages:/);
  assert.match(app, /use\.textContent = "Select workflow"/);
  assert.match(app, /use\.textContent = "Select service"/);
});
