import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { closeProductDb, listWebhookDeliveries, openProductDb } from "../src/lib/product-db.js";
import { deliverWebhook, signWebhook, validateWebhookUrl } from "../src/lib/webhook-service.js";

test("v4 webhook URL policy rejects HTTP, credentials, localhost and private IPs",()=>{for(const u of ["http://example.com/hook","https://localhost/hook","https://127.0.0.1/hook","https://user:pass@example.com/hook"])assert.throws(()=>validateWebhookUrl(u));assert.equal(validateWebhookUrl("https://hooks.example.com/ckbuilder").hostname,"hooks.example.com");});

test("v4 webhook signatures are deterministic HMAC SHA-256",()=>{const a=signWebhook("s".repeat(24),"123","body");const b=signWebhook("s".repeat(24),"123","body");assert.equal(a,b);assert.match(a,/^sha256=[0-9a-f]{64}$/);assert.notEqual(a,signWebhook("x".repeat(24),"123","body"));});

test("v4 signed webhook records successful delivery",async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),"ckbuilder-hook-"));const db=openProductDb(path.join(root,"db.sqlite"));try{let request;const result=await deliverWebhook({db,url:"https://hooks.example.com/ckbuilder",secret:"s".repeat(32),eventType:"credential.issued",payload:{id:"C1"},lookup:async()=>[{address:"203.0.113.10"}],fetchImpl:async(url,options)=>{request={url,options};return {ok:true,status:204}}});assert.equal(result.delivered,true);assert.match(request.options.headers["x-ckbuilder-signature"],/^sha256=/);assert.equal(request.options.headers["x-ckbuilder-event"],"credential.issued");assert.equal(listWebhookDeliveries(db)[0].status,"DELIVERED");}finally{closeProductDb(db)}});

test("v4 webhook failure is recorded but returned as non-throwing delivery result",async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),"ckbuilder-hookfail-"));const db=openProductDb(path.join(root,"db.sqlite"));try{const result=await deliverWebhook({db,url:"https://hooks.example.com/ckbuilder",secret:"s".repeat(32),eventType:"credential.revoked",payload:{},lookup:async()=>[{address:"203.0.113.11"}],fetchImpl:async()=>({ok:false,status:500})});assert.equal(result.delivered,false);assert.equal(listWebhookDeliveries(db)[0].status,"FAILED");}finally{closeProductDb(db)}});

test("v4 webhook DNS rebinding protection rejects private resolved addresses",async()=>{await assert.rejects(()=>deliverWebhook({url:"https://hooks.example.com/x",secret:"s".repeat(32),eventType:"x",payload:{},lookup:async()=>[{address:"10.0.0.5"}],fetchImpl:async()=>({ok:true,status:200})}),/private/);});
