import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createAgentJobReceipt, createAgentServiceAgreement, verifyAgentJobReceipt, verifyAgentServiceAgreement } from "../src/lib/agent-commerce-service.js";
import { getAgentJob, recordAgentJob, serviceReputation } from "../src/lib/agent-job-store.js";
import { agentRuntimeDoctor, analyzeCkbTransaction, runCkbTransactionPreflight } from "../src/lib/agent-ops-service.js";

function tmp(){return fs.mkdtempSync(path.join(os.tmpdir(),"ckbuilder-v9-"));}
function tx(){return {version:"0x0",cell_deps:[{out_point:{tx_hash:`0x${"11".repeat(32)}`,index:"0x0"},dep_type:"code"}],header_deps:[],inputs:[{previous_output:{tx_hash:`0x${"22".repeat(32)}`,index:"0x0"},since:"0x0"}],outputs:[{capacity:"0x174876e800",lock:{code_hash:`0x${"33".repeat(32)}`,hash_type:"type",args:"0x1234"},type:null}],outputs_data:["0x"],witnesses:["0x"]};}
function jsonResponse(v){return new Response(JSON.stringify(v),{status:200,headers:{"content-type":"application/json"}});}

test("v9 private job ledger requires the per-job access token and derives reputation",()=>{const data=tmp();const receipt=createAgentJobReceipt({service:{id:"svc"},objective:"private objective",result:{text:"done",toolTrace:[{pluginId:"ckb-rpc",tool:"tip",status:"ok"}]}});const result={service:{id:"svc"},receipt,fulfillment:{verdict:"fulfilled"},agreement:{agreementId:"a"},text:"done",toolTrace:[{pluginId:"ckb-rpc",tool:"tip",status:"ok"}]};const access=recordAgentJob(data,{objective:"private objective",result});assert.ok(access.jobAccessToken);assert.throws(()=>getAgentJob(data,access.jobId,"wrong"),e=>e.code==="AGENT_JOB_NOT_FOUND");const job=getAgentJob(data,access.jobId,access.jobAccessToken);assert.equal(job.objective,"private objective");const rep=serviceReputation(data).svc;assert.equal(rep.jobs,1);assert.equal(rep.fulfillmentRate,1);assert.equal(rep.evidenceSuccessRate,1);});

test("v9 receipt verifier detects receipt and agreement tampering",()=>{const service={id:"svc",outcome:"x",payment:{mode:"none"},evaluation:{minSuccessfulToolCalls:0,anyEvidenceFrom:[]}};const agreement=createAgentServiceAgreement({service,objective:"x",createdAt:"2026-08-14T00:00:00.000Z"});const receipt=createAgentJobReceipt({service,objective:"x",result:{text:"ok",toolTrace:[]},agreement,createdAt:"2026-08-14T00:00:00.000Z",jobId:"j"});assert.equal(verifyAgentJobReceipt(receipt,{agreement}).valid,true);assert.equal(verifyAgentJobReceipt({...receipt,serviceId:"evil"},{agreement}).valid,false);assert.equal(verifyAgentJobReceipt(receipt,{agreement:{...agreement,expectedOutcome:"tampered"}}).valid,false);});


test("v9 pre-execution service agreement is bound to objective and policy",()=>{const service={id:"svc",outcome:"evidence",payment:{mode:"quote-only"},evaluation:{minSuccessfulToolCalls:1,anyEvidenceFrom:["ckb-rpc"]}};const agreement=createAgentServiceAgreement({service,objective:"ship release",input:{maxSteps:4}});assert.equal(verifyAgentServiceAgreement(agreement,{service,objective:"ship release"}),true);assert.throws(()=>verifyAgentServiceAgreement({...agreement,executionTerms:{...agreement.executionTerms,autonomousSpend:true}},{service,objective:"ship release"}),e=>e.code==="AGENT_SERVICE_AGREEMENT_MISMATCH");assert.throws(()=>verifyAgentServiceAgreement(agreement,{service,objective:"different objective"}),e=>e.code==="AGENT_SERVICE_AGREEMENT_MISMATCH");});
test("v9 deterministic CKB transaction preflight reports structure and duplicate-input risk",()=>{const clean=analyzeCkbTransaction(tx());assert.equal(clean.valid,true);assert.equal(clean.riskLevel,"low");assert.equal(clean.signingAuthority,false);const bad=tx();bad.inputs.push(structuredClone(bad.inputs[0]));bad.witnesses.push("0x");const result=analyzeCkbTransaction(bad);assert.equal(result.riskLevel,"high");assert.ok(result.warnings.some(x=>x.code==="DUPLICATE_INPUT"));});

test("v9 transaction live preflight calls only dry_run_transaction and never broadcast",async()=>{const methods=[];const result=await runCkbTransactionPreflight({transaction:tx()},{ROOT_DIR:process.cwd(),CKB_RPC_URL:"http://127.0.0.1:8114"},{toolFetchImpl:async(_u,o)=>{const b=JSON.parse(o.body);methods.push(b.method);return jsonResponse({jsonrpc:"2.0",id:1,result:{cycles:"0x123"}});}});assert.deepEqual(methods,["dry_run_transaction"]);assert.equal(result.dryRun.status,"ok");assert.equal(result.safety.broadcastCalled,false);});

test("v9 agent runtime doctor distinguishes installed from runnable integrations without exposing endpoints",()=>{const root=tmp();const report=agentRuntimeDoctor({APP_NETWORK:"testnet",AI_ENABLED:true,CKB_RPC_URL:"",FIBER_RPC_URL:"",CKB_AGENT_WORKSPACE:""},root);assert.ok(report.plugins.some(p=>p.id==="ckb-rpc"&&p.status==="needs-config"));assert.ok(report.plugins.some(p=>p.id==="fiber-rpc"&&p.status==="needs-config"));assert.equal(JSON.stringify(report).includes("http://"),false);assert.equal(report.safety.autonomousSpend,false);});

test("v9 receipt and transaction preflight CLIs provide offline verification surfaces", async () => {
  const { spawnSync } = await import("node:child_process"); const root=tmp();
  const service={id:"cli",outcome:"x",payment:{mode:"none"},evaluation:{minSuccessfulToolCalls:0,anyEvidenceFrom:[]}}; const agreement=createAgentServiceAgreement({service,objective:"x"}); const receipt=createAgentJobReceipt({service,objective:"x",result:{text:"ok",toolTrace:[]},agreement});
  const pack=path.join(root,"pack.json"), txFile=path.join(root,"tx.json"); fs.writeFileSync(pack,JSON.stringify({agreement,receipt})); fs.writeFileSync(txFile,JSON.stringify(tx()));
  const verify=spawnSync(process.execPath,["src/cli/verify-agent-receipt.js",pack],{cwd:process.cwd(),encoding:"utf8"}); assert.equal(verify.status,0); assert.match(verify.stdout,/\"valid\": true/);
  const pre=spawnSync(process.execPath,["src/cli/preflight-ckb-transaction.js",txFile],{cwd:process.cwd(),encoding:"utf8"}); assert.equal(pre.status,0); assert.match(pre.stdout,/\"riskLevel\": \"low\"/);
});
