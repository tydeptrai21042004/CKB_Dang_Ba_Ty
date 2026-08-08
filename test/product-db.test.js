import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSubmission, ensureBootstrapAdmin, findUserByEmail, getTrackedSubmission, listSubmissions, openProductDb, closeProductDb, verifyPassword } from "../src/lib/product-db.js";

test("product DB persists submissions and protects tracking tokens", () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"ckbuilder-db-")); const db=openProductDb(path.join(root,"product.sqlite"));
  const created=createSubmission(db,{applicantName:"Builder",applicantEmail:"b@example.com",recipientLockHash:`0x${"11".repeat(32)}`,credentialType:"Builder Milestone",credentialTitle:"Type Script Builder",category:"CKB",evidence:["https://github.com/example/repo"],notes:"demo"});
  assert.equal(listSubmissions(db).length,1);
  assert.equal(getTrackedSubmission(db,created.id,"wrong"),null);
  assert.equal(getTrackedSubmission(db,created.id,created.trackingToken).status,"SUBMITTED"); closeProductDb(db);
});

test("bootstrap admin uses a one-way password hash", () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"ckbuilder-authdb-")); const db=openProductDb(path.join(root,"product.sqlite"));
  ensureBootstrapAdmin(db,"admin@example.com","correct horse battery staple"); const user=findUserByEmail(db,"admin@example.com");
  assert.ok(user.password_hash.includes("pbkdf2-sha256")); assert.equal(user.password_hash.includes("correct horse"),false);
  assert.equal(verifyPassword("correct horse battery staple",user.password_hash),true); assert.equal(verifyPassword("wrong",user.password_hash),false); closeProductDb(db);
});
