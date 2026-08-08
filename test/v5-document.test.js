import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { credentialHtml } from "../src/lib/credential-html.js";
import { decodeDocumentInput, htmlVisibleText, inspectDocumentInput, sanitizeHtmlFragment, supportedDocumentTypes } from "../src/lib/document-service.js";

function b64(text){return Buffer.from(text).toString("base64")}
function record(title="Type Script Builder"){return {schema:"ckb-degree-proof-record/v1",status:"ACTIVE",payload:{schema:"ckbuilder-credential/v2",credentialId:"CKB-HTML-001",credentialType:"Builder Milestone",issuer:{issuerId:`0x${"aa".repeat(32)}`,name:"CKBuilder",lockHash:`0x${"bb".repeat(32)}`},subject:{recipientLockHash:`0x${"cc".repeat(32)}`,identityCommitment:`0x${"dd".repeat(32)}`},award:{title,field:"CKB",classification:"Builder Milestone",issuedAt:"2026-08-08"},document:{hashAlgorithm:"sha256",hash:`0x${"ee".repeat(32)}`,fileName:"certificate.html"},createdAt:"2026-08-08T00:00:00.000Z"},issuerPublicKeyPem:"PUBLIC KEY <unsafe>",signature:"sig"}}

test("v5 HTML visible-text extraction removes executable and hidden blocks",()=>{const html='<h1>Certificate</h1><script>steal()</script><style>.x{}</style><iframe>evil</iframe><p>Alice &amp; Bob</p>';const text=htmlVisibleText(html);assert.match(text,/Certificate/);assert.match(text,/Alice & Bob/);assert.doesNotMatch(text,/steal|evil|\.x/);});

test("v5 HTML sanitizer preserves safe structure but strips all attributes and active tags",()=>{const safe=sanitizeHtmlFragment('<div onclick="x"><a href="javascript:x">link</a><p style="x">ok</p><svg onload=x><script>x</script></svg></div>');assert.equal(safe.includes('onclick'),false);assert.equal(safe.includes('href'),false);assert.equal(safe.includes('style='),false);assert.equal(safe.includes('<a'),false);assert.equal(safe.includes('<svg'),false);assert.match(safe,/<div>/);assert.match(safe,/<p>ok<\/p>/);});

test("v5 deterministic HTML inspection returns SHA-256 and sanitized preview",()=>{const raw='<h1>Credential</h1><img src=x onerror=alert(1)><script>alert(2)</script><p>ID: C-1</p>';const result=inspectDocumentInput({fileName:"credential.html",mimeType:"text/html",documentBase64:b64(raw)});assert.equal(result.mimeType,"text/html");assert.equal(result.sha256,crypto.createHash("sha256").update(raw).digest("hex"));assert.match(result.textExcerpt,/Credential/);assert.match(result.safeHtml,/Safe preview/);assert.doesNotMatch(result.safeHtml,/onerror|<script|alert\(2\)|<img/);});

test("v5 Markdown, text and JSON are extracted without AI",()=>{for(const [fileName,mimeType,content] of [["a.md","text/markdown","# Builder\nCKB"],["a.txt","text/plain","hello"],["a.json","application/json",'{"credentialId":"C-1"}']]){const r=inspectDocumentInput({fileName,mimeType,documentBase64:b64(content)});assert.equal(r.textExtracted,true);assert.ok(r.textExcerpt.length>0);}});

test("v5 malformed JSON documents fail closed",()=>{assert.throws(()=>inspectDocumentInput({fileName:"bad.json",mimeType:"application/json",documentBase64:b64("{bad")}),e=>e.code==="DOCUMENT_JSON_INVALID");});

test("v5 extension/MIME disagreement is rejected",()=>{assert.throws(()=>decodeDocumentInput({fileName:"evil.html",mimeType:"image/png",documentBase64:b64("<p>x</p>")}),e=>e.code==="DOCUMENT_TYPE_MISMATCH");});

test("v5 unsupported executable document types are rejected",()=>{assert.throws(()=>decodeDocumentInput({fileName:"payload.svg",mimeType:"image/svg+xml",documentBase64:b64("<svg></svg>")}),e=>e.code==="DOCUMENT_TYPE_UNSUPPORTED");});

test("v5 supported document catalog includes HTML, PDF, text and safe image formats",()=>{const t=supportedDocumentTypes();for(const x of ["text/html","text/plain","text/markdown","application/json","application/pdf","image/png","image/jpeg","image/webp"])assert.ok(t.includes(x));assert.equal(t.includes("image/svg+xml"),false);});

test("v5 printable credential HTML escapes attacker-controlled credential fields",()=>{const html=credentialHtml(record('<img src=x onerror=alert(1)><script>x</script>'),"https://verify.example");assert.match(html,/&lt;img/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<img src=x|<script>x<\/script>/);assert.match(html,/Verify current status/);assert.match(html,/Issuer public-key fingerprint/);});
