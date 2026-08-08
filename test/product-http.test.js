import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";
import { createInspectorServer } from "../src/lib/inspector-http.js";
import { emptyLedger } from "../src/lib/ledger.js";
import { writeJsonAtomic } from "../src/lib/json.js";
import { openProductDb, closeProductDb } from "../src/lib/product-db.js";

async function withApp(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),"ckbuilder-product-http-"));const pub=path.join(root,"public");const data=path.join(root,"data");fs.mkdirSync(pub);fs.mkdirSync(data);fs.writeFileSync(path.join(pub,"index.html"),"<title>test</title>");writeJsonAtomic(path.join(data,"ledger.json"),emptyLedger());const db=openProductDb(path.join(data,"p.sqlite"));const config={ROOT_DIR:root,DATA_DIR:data,PRODUCT_DB_PATH:path.join(data,"p.sqlite"),APP_NETWORK:"devnet",CKB_RPC_URL:"http://127.0.0.1:9",ISSUER_LOCK_HASH:`0x${"11".repeat(32)}`,PUBLIC_BASE_URL:"http://example.test",AI_ENABLED:true,AI_DEFAULT_PROVIDER:"openai",AI_DEFAULT_MODEL:"gpt-4.1-mini"};const server=createInspectorServer({config,publicDir:pub,productDb:db,learningOverview:()=>({summary:{}}),inspectCredential:async()=>({})});server.listen(0,"127.0.0.1");await once(server,"listening");try{await fn(`http://127.0.0.1:${server.address().port}`)}finally{await new Promise(r=>server.close(r));closeProductDb(db)}}

test("public product config never exposes an AI key",async()=>withApp(async base=>{const r=await fetch(`${base}/api/config`);const b=await r.json();assert.equal(r.status,200);assert.equal("apiKey" in b,false);assert.ok(b.aiProviders.some(x=>x.id==="openai"))}));

test("evidence submission returns a tracking token but status requires it",async()=>withApp(async base=>{const payload={applicantName:"Builder",applicantEmail:"b@example.com",recipientLockHash:`0x${"22".repeat(32)}`,credentialType:"Builder Milestone",credentialTitle:"Type Script Builder",category:"CKB",evidence:["https://github.com/example/repo"]};const r=await fetch(`${base}/api/submissions`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const created=await r.json();assert.equal(r.status,201);assert.ok(created.trackingToken);const denied=await fetch(`${base}/api/submissions/${created.id}?token=wrong`);assert.equal(denied.status,404);const ok=await fetch(`${base}/api/submissions/${created.id}?token=${encodeURIComponent(created.trackingToken)}`);assert.equal((await ok.json()).status,"SUBMITTED")}));

test("passport endpoint returns an empty public passport for a valid lock hash",async()=>withApp(async base=>{const lock=`0x${"33".repeat(32)}`;const r=await fetch(`${base}/api/passport/${lock}`);const b=await r.json();assert.equal(r.status,200);assert.equal(b.counts.total,0);assert.equal(b.recipientLockHash,lock)}));
