import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const publicHtml=fs.readFileSync(path.join(root,"public","index.html"),"utf8");
const publicApp=fs.readFileSync(path.join(root,"public","app.js"),"utf8");
const issuerHtml=fs.readFileSync(path.join(root,"issuer-public","index.html"),"utf8");
const issuerApp=fs.readFileSync(path.join(root,"issuer-public","app.js"),"utf8");

test("v4 public UI exposes opt-in directory and workflow timeline controls",()=>{for(const id of ["directory-nav","view-directory","directory-form","tracking-timeline","tracking-resubmit","tracking-cancel"])assert.match(publicHtml,new RegExp(`id="${id}"`));assert.match(publicApp,/publicDirectoryEnabled/);assert.match(publicApp,/resubmit/);assert.match(publicApp,/cancel/);});

test("v4 issuer UI exposes dashboard, bulk intake, operations and webhook tabs",()=>{for(const tab of ["dashboard","bulk","operations","webhooks"])assert.match(issuerHtml,new RegExp(`data-tab="${tab}"`));for(const id of ["dashboard-stats","bulk-json","operations","webhooks"])assert.match(issuerHtml,new RegExp(`id="${id}"`));});

test("v4 review UI renders approve controls only for submitted status",()=>{assert.match(issuerApp,/s\.status==='SUBMITTED'/);assert.match(issuerApp,/Approve & issue/);});

test("v4 AI API key remains browser-session only in both UIs",()=>{assert.doesNotMatch(publicApp,/localStorage\.setItem\([^\n]*apiKey/);assert.doesNotMatch(issuerApp,/localStorage\.setItem\([^\n]*ai/);assert.match(publicApp,/sessionAi\.apiKey/);assert.match(issuerApp,/let ai=\{key:/);});

test("v4 dynamic product UI still avoids innerHTML assignment",()=>{assert.doesNotMatch(publicApp,/\.innerHTML\s*=/);assert.doesNotMatch(issuerApp,/\.innerHTML\s*=/);});

test("v4 public and issuer HTML keep unique IDs",()=>{for(const html of [publicHtml,issuerHtml]){const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);}});

test("v4 production Compose separates public and issuer environment files",()=>{const compose=fs.readFileSync(path.join(root,"docker-compose.production.yml"),"utf8");assert.match(compose,/env_file: \.env\.public/);assert.match(compose,/env_file: \.env\.issuer/);assert.doesNotMatch(compose,/env_file: \.env\n/);assert.match(compose,/api\/ready/);});

test("v4 public environment example contains no issuer, admin, session or webhook secrets",()=>{const env=fs.readFileSync(path.join(root,".env.public.example"),"utf8");for(const key of ["ISSUER_PRIVATE_KEY_PATH","CKB_ISSUER_PRIVATE_KEY_FILE","ADMIN_PASSWORD","SESSION_SECRET","WEBHOOK_SECRET"])assert.doesNotMatch(env,new RegExp(`^${key}=`,`m`));});

test("v4 split environment examples are explicitly allowed by gitignore",()=>{const ignore=fs.readFileSync(path.join(root,".gitignore"),"utf8");assert.match(ignore,/!\.env\.public\.example/);assert.match(ignore,/!\.env\.issuer\.example/);});


test("v4 Compose explicitly enables process-environment-only mode for both services",()=>{const compose=fs.readFileSync(path.join(root,"docker-compose.production.yml"),"utf8");assert.equal((compose.match(/CKBUILDER_PROCESS_ENV_ONLY:/g)||[]).length,3);});

test("v4 Docker build context excludes runtime secrets and state",()=>{const ignore=fs.readFileSync(path.join(root,".dockerignore"),"utf8");for(const pattern of [".env.*","secrets/","data/","node_modules/"])assert.match(ignore,new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}$`,`m`));for(const example of ["!.env.example","!.env.public.example","!.env.issuer.example"])assert.match(ignore,new RegExp(`^${example.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}$`,`m`));});


test("v4 Compose initializes issuer trust before starting public services",()=>{const compose=fs.readFileSync(path.join(root,"docker-compose.production.yml"),"utf8");assert.match(compose,/issuer-init:/);assert.match(compose,/command: \["npm","run","issuer:init"\]/);assert.match(compose,/condition: service_completed_successfully/);});

test("v4 long-running issuer gets a read-only secrets mount while bootstrap alone can create keys",()=>{const compose=fs.readFileSync(path.join(root,"docker-compose.production.yml"),"utf8");const init=compose.slice(compose.indexOf("  issuer-init:"),compose.indexOf("  public:"));const issuer=compose.slice(compose.indexOf("  issuer:",compose.indexOf("  public:")));assert.match(init,/\.\/secrets:\/app\/secrets(?:\n|$)/);assert.doesNotMatch(init,/\.\/secrets:\/app\/secrets:ro/);assert.match(issuer,/\.\/secrets:\/app\/secrets:ro/);});
