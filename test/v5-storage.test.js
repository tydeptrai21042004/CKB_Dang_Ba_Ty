import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { auditAttachmentStorage, storeSubmissionAttachment } from "../src/lib/attachment-service.js";
import { closeProductDb, createSubmission, getAdminStats, openProductDb } from "../src/lib/product-db.js";

function setup(){const root=fs.mkdtempSync(path.join(os.tmpdir(),"ckbuilder-v5storage-"));const data=path.join(root,"data");fs.mkdirSync(data);const db=openProductDb(path.join(data,"p.sqlite"));const config={DATA_DIR:data};const submission=createSubmission(db,{applicantName:"Alice",applicantEmail:"a@example.com",recipientLockHash:`0x${"11".repeat(32)}`,credentialType:"Builder Milestone",credentialTitle:"Builder",category:"CKB",evidence:["x"],notes:""});return{root,data,db,config,submission}}

test("v5 attachment storage audit is clean for intact evidence and stats count files",()=>{const x=setup();try{storeSubmissionAttachment(x.config,x.db,x.submission.id,{fileName:"proof.html",mimeType:"text/html",documentBase64:Buffer.from("<p>ok</p>").toString("base64")});const a=auditAttachmentStorage(x.config,x.db);assert.equal(a.ok,true);assert.equal(a.checked,1);assert.equal(getAdminStats(x.db).attachments,1);}finally{closeProductDb(x.db);fs.rmSync(x.root,{recursive:true,force:true})}});

test("v5 attachment audit reports orphaned storage files",()=>{const x=setup();try{const dir=path.join(x.data,"product-attachments","orphan");fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,"lost.bin"),"lost");const a=auditAttachmentStorage(x.config,x.db);assert.equal(a.ok,false);assert.equal(a.orphaned.length,1);}finally{closeProductDb(x.db);fs.rmSync(x.root,{recursive:true,force:true})}});

test("v5 attachment audit reports missing files",()=>{const x=setup();try{const a=storeSubmissionAttachment(x.config,x.db,x.submission.id,{fileName:"proof.txt",mimeType:"text/plain",documentBase64:Buffer.from("ok").toString("base64")});const row=x.db.prepare("SELECT storage_relpath FROM submission_attachments WHERE id=?").get(a.id);fs.rmSync(path.join(x.data,"product-attachments",row.storage_relpath));const result=auditAttachmentStorage(x.config,x.db);assert.equal(result.ok,false);assert.equal(result.missing.length,1);}finally{closeProductDb(x.db);fs.rmSync(x.root,{recursive:true,force:true})}});
