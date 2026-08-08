import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  addSubmissionEvent, cancelTrackedSubmission, closeProductDb, createOperation, createSubmission,
  exportOperationalSnapshot, getAdminStats, getTrackedSubmissionWithTimeline, listOperations,
  listSubmissionsFiltered, openProductDb, resubmitTrackedSubmission, updateSubmission, verifyPassword
} from "../src/lib/product-db.js";

function setup() { const root=fs.mkdtempSync(path.join(os.tmpdir(),"ckbuilder-v4db-")); return {root,db:openProductDb(path.join(root,"db.sqlite"))}; }
function input(n="A") { return {applicantName:`Builder ${n}`,applicantEmail:`${n.toLowerCase()}@example.com`,recipientLockHash:`0x${"11".repeat(32)}`,credentialType:"Builder Milestone",credentialTitle:`Type Script ${n}`,category:"CKB",evidence:[`https://github.com/example/${n}`],notes:"demo"}; }

test("v4 submission timeline records creation and status transitions",()=>{const x=setup();try{const c=createSubmission(x.db,input());updateSubmission(x.db,c.id,{status:"CHANGES_REQUESTED",reviewerNotes:"add tx"},"reviewer@example.com");const item=getTrackedSubmissionWithTimeline(x.db,c.id,c.trackingToken);assert.deepEqual(item.timeline.map(e=>e.event_type),["SUBMITTED","CHANGES_REQUESTED"]);assert.equal(item.timeline[1].actor,"reviewer@example.com");}finally{closeProductDb(x.db)}});

test("v4 applicant can resubmit only after changes are requested",()=>{const x=setup();try{const c=createSubmission(x.db,input());assert.throws(()=>resubmitTrackedSubmission(x.db,c.id,c.trackingToken,{evidence:["x"],notes:"n"}),e=>e.code==="RESUBMISSION_NOT_ALLOWED");updateSubmission(x.db,c.id,{status:"CHANGES_REQUESTED"},"reviewer");const r=resubmitTrackedSubmission(x.db,c.id,c.trackingToken,{evidence:["new-evidence"],notes:"fixed"});assert.equal(r.status,"SUBMITTED");assert.deepEqual(r.evidence,["new-evidence"]);assert.equal(getTrackedSubmissionWithTimeline(x.db,c.id,c.trackingToken).timeline.at(-1).event_type,"RESUBMITTED");}finally{closeProductDb(x.db)}});

test("v4 applicant can cancel pending work but not issued work",()=>{const x=setup();try{const c=createSubmission(x.db,input());assert.equal(cancelTrackedSubmission(x.db,c.id,c.trackingToken).status,"CANCELLED");assert.throws(()=>cancelTrackedSubmission(x.db,c.id,c.trackingToken),e=>e.code==="CANCELLATION_NOT_ALLOWED");}finally{closeProductDb(x.db)}});

test("v4 wrong tracking token cannot resubmit or cancel",()=>{const x=setup();try{const c=createSubmission(x.db,input());updateSubmission(x.db,c.id,{status:"CHANGES_REQUESTED"});assert.equal(resubmitTrackedSubmission(x.db,c.id,"wrong",{evidence:["x"]}),null);assert.equal(cancelTrackedSubmission(x.db,c.id,"wrong"),null);}finally{closeProductDb(x.db)}});

test("v4 filtered submission search is bounded and parameterized",()=>{const x=setup();try{createSubmission(x.db,input("Alpha"));const b=createSubmission(x.db,input("Beta"));updateSubmission(x.db,b.id,{status:"REJECTED"});assert.equal(listSubmissionsFiltered(x.db,{query:"Alpha"}).length,1);assert.equal(listSubmissionsFiltered(x.db,{status:"REJECTED"}).length,1);assert.equal(listSubmissionsFiltered(x.db,{limit:9999}).length,2);assert.equal(listSubmissionsFiltered(x.db,{query:"%' OR 1=1 --"}).length,0);}finally{closeProductDb(x.db)}});

test("v4 admin stats summarize workflow and operations",()=>{const x=setup();try{const a=createSubmission(x.db,input("A"));const b=createSubmission(x.db,input("B"));updateSubmission(x.db,b.id,{status:"REJECTED"});createOperation(x.db,"ISSUE","C1","FAILED",null,"boom");const s=getAdminStats(x.db);assert.equal(s.submissions.total,2);assert.equal(s.submissions.byStatus.SUBMITTED,1);assert.equal(s.submissions.byStatus.REJECTED,1);assert.equal(s.operations.byStatus.FAILED,1);assert.equal(listOperations(x.db,{status:"FAILED"}).length,1);addSubmissionEvent(x.db,a.id,"NOTE",{ok:true},"system");}finally{closeProductDb(x.db)}});

test("v4 operational export excludes password and tracking hashes",()=>{const x=setup();try{createSubmission(x.db,input());const snapshot=exportOperationalSnapshot(x.db);const raw=JSON.stringify(snapshot);assert.equal(raw.includes("password_hash"),false);assert.equal(raw.includes("tracking_hash"),false);assert.equal(snapshot.submissions.length,1);}finally{closeProductDb(x.db)}});

test("v4 password verifier rejects malformed or unreasonable iteration encodings",()=>{assert.equal(verifyPassword("x","pbkdf2-sha256$999999999$abcd$00"),false);assert.equal(verifyPassword("x","pbkdf2-sha256$bad$abcd$00"),false);});
