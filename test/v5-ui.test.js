import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const html=fs.readFileSync(path.join(root,"public","index.html"),"utf8");
const app=fs.readFileSync(path.join(root,"public","app.js"),"utf8");
const issuerApp=fs.readFileSync(path.join(root,"issuer-public","app.js"),"utf8");

test("v5 public UI accepts HTML and companion document formats",()=>{assert.match(html,/id="document"[^>]+\.html/);assert.match(html,/id="submission-files"[^>]+multiple/);for(const id of ["inspect-document","document-info","document-html-preview","html-credential","tracking-attachments"])assert.match(html,new RegExp(`id="${id}"`));});

test("v5 HTML preview uses sandboxed srcdoc rather than innerHTML",()=>{assert.match(html,/id="document-html-preview"[^>]+sandbox=""/);assert.match(app,/preview\.srcdoc\s*=\s*result\.safeHtml/);assert.doesNotMatch(app,/\.innerHTML\s*=/);});

test("v5 applicant UI uploads attachments only after receiving a private tracking token",()=>{assert.match(app,/uploadSelectedSubmissionFiles\(created\.id, created\.trackingToken\)/);assert.match(app,/trackingToken/);assert.match(app,/attachments\/\$\{encodeURIComponent\(attachment\.id\)\}/);});

test("v5 issuer UI exposes safe preview and raw download as separate actions",()=>{assert.match(issuerApp,/Safe preview/);assert.match(issuerApp,/Download raw/);assert.match(issuerApp,/\/preview/);assert.match(issuerApp,/\/download/);});

test("v5 UI still does not persist BYOK AI keys",()=>{assert.doesNotMatch(app,/localStorage\.setItem\([^\n]*apiKey/);assert.doesNotMatch(issuerApp,/localStorage\.setItem\([^\n]*ai\.key/);});

test("v5 issuer operations UI exposes evidence storage audit",()=>{const issuerHtml=fs.readFileSync(path.join(root,"issuer-public","index.html"),"utf8");assert.match(issuerHtml,/id="audit-attachments"/);assert.match(issuerHtml,/id="attachment-audit-status"/);assert.match(issuerApp,/\/api\/admin\/attachments\/audit/);});

test("v5 submission UI saves the tracking token before optional attachment upload",()=>{const created=app.indexOf('const created = await postJson("/api/submissions"');const save=app.indexOf('localStorage.setItem(`ckbuilder-submission-${created.id}`',created);const upload=app.indexOf('uploadSelectedSubmissionFiles(created.id, created.trackingToken)',created);assert.ok(created>=0&&save>created&&upload>save);});
