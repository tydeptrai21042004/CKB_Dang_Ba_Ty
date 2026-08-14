import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";
import { createAgentJobReceipt, runAgentService, verifyAgentJobReceipt, verifyFiberPaymentSettlement } from "../src/lib/agent-commerce-service.js";
import { agentJobStoreInfo, getAgentJob, recordAgentJob, serviceReputation } from "../src/lib/agent-job-store.js";
import { loadOrCreateAgentServiceIdentity } from "../src/lib/agent-identity.js";
import { buildCkbCapacityTransferIntent } from "../src/lib/agent-ops-service.js";
import { agentToolApprovalFingerprint, resolveAgentTools } from "../src/lib/plugin-service.js";
import { discoverMcpServer, MCP_PROTOCOL_CURRENT, validateMcpEndpoint } from "../src/lib/mcp-client.js";
import { createInspectorServer } from "../src/lib/inspector-http.js";

function tmp(){ return fs.mkdtempSync(path.join(os.tmpdir(), "ckbuilder-v10-")); }
function openAiText(text){ return jsonResponse({ choices:[{ message:{ content:text } }] }); }
function jsonResponse(value){ return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } }); }
function lock(byte="11"){ return { code_hash:`0x${byte.repeat(32)}`, hash_type:"type", args:"0x1234" }; }
function cell(byte, capacity){ return { out_point:{ tx_hash:`0x${byte.repeat(32)}`, index:"0x0" }, output:{ capacity:`0x${BigInt(capacity).toString(16)}`, lock:lock("11") } }; }

test("v10 service identity persists and signs independently verifiable receipts", () => {
  const data=tmp(); const identity=loadOrCreateAgentServiceIdentity(data); const again=loadOrCreateAgentServiceIdentity(data);
  assert.equal(identity.serviceId, again.serviceId);
  const receipt=createAgentJobReceipt({ service:{id:"svc"}, objective:"prove work", result:{text:"done",toolTrace:[]}, identity, createdAt:"2026-08-15T00:00:00.000Z", jobId:"v10-job" });
  const verified=verifyAgentJobReceipt(receipt);
  assert.equal(receipt.authenticity.mode,"ed25519"); assert.equal(verified.valid,true); assert.equal(verified.authenticityVerified,true); assert.equal(verified.serviceIdentity,identity.serviceId);
  assert.equal(verifyAgentJobReceipt({...receipt,authenticity:{...receipt.authenticity,signature:"AAAA"}}).valid,false);
  const mode=fs.statSync(path.join(data,"private","agent-service-identity.json")).mode & 0o777; assert.equal(mode,0o600);
});

test("v10 agent jobs use SQLite and reputation counts signed receipts", () => {
  const data=tmp(); const identity=loadOrCreateAgentServiceIdentity(data); const receipt=createAgentJobReceipt({service:{id:"svc"},objective:"x",result:{text:"ok",toolTrace:[{pluginId:"ckb-rpc",tool:"tip",status:"ok"}]},identity});
  const result={service:{id:"svc"},receipt,fulfillment:{verdict:"fulfilled"},agreement:null,text:"ok",toolTrace:[{pluginId:"ckb-rpc",tool:"tip",status:"ok"}]};
  const access=recordAgentJob(data,{objective:"x",result}); assert.equal(getAgentJob(data,access.jobId,access.jobAccessToken).receipt.receiptHash,receipt.receiptHash);
  assert.equal(agentJobStoreInfo(data).database,"agent-jobs.sqlite"); assert.equal(fs.existsSync(path.join(data,"agent-jobs.sqlite")),true);
  const rep=serviceReputation(data).svc; assert.equal(rep.signedReceipts,1); assert.equal(rep.signedReceiptRate,1);
});

test("v10 transaction builder returns an unsigned balanced intent with change", () => {
  const built=buildCkbCapacityTransferIntent({ toLock:lock("22"), amountShannons:"10000000000", feeShannons:"1000", liveCells:[cell("aa",15000000000n)] });
  assert.equal(built.schema,"ckbuilder-ckb-capacity-transfer-intent/v1"); assert.equal(built.transaction.inputs.length,1); assert.equal(built.transaction.outputs.length,2);
  assert.equal(built.selection.changeShannons,"4999999000"); assert.equal(built.safety.unsigned,true); assert.equal(built.safety.requiresHumanWalletApproval,true); assert.equal(built.safety.broadcastAuthority,false);
});

test("v10 exact MCP approval is bound to tool arguments even when a legacy tool name is also present", async () => {
  const root=tmp(); fs.mkdirSync(path.join(root,"plugins","community"),{recursive:true}); fs.writeFileSync(path.join(root,"plugins","community","x.json"),JSON.stringify({schemaVersion:1,id:"community-x",name:"X",transport:"mcp",endpoint:"https://example.test/mcp"}));
  let calls=0; const fetchImpl=async(_url,options)=>{ const body=JSON.parse(options.body); if(body.method==="tools/list") return jsonResponse({jsonrpc:"2.0",id:1,result:{tools:[{name:"lookup",inputSchema:{type:"object"}}]}}); if(body.method==="tools/call"){ calls++; return jsonResponse({jsonrpc:"2.0",id:1,result:{content:[{type:"text",text:"ok"}]}}); } throw new Error("unexpected"); };
  const toolName="community-x__lookup"; const approvedArgs={q:"safe"}; const fingerprint=agentToolApprovalFingerprint(toolName,approvedArgs);
  const runtime=await resolveAgentTools(["community-x"],{rootDir:root,fetchImpl,approvedTools:[toolName],approvedOperations:[{tool:toolName,argumentsHash:fingerprint}]});
  await assert.rejects(()=>runtime.execute(toolName,{q:"changed"}),e=>e.code==="PLUGIN_CONFIRMATION_REQUIRED"); assert.equal(calls,0);
  await runtime.execute(toolName,approvedArgs); assert.equal(calls,1);
});

test("v10 Fiber settlement verifier performs a read-only get_payment lookup", async () => {
  const methods=[]; const result=await verifyFiberPaymentSettlement({paymentHash:`0x${"ab".repeat(32)}`},{FIBER_RPC_URL:"http://127.0.0.1:8227"},{toolFetchImpl:async(_url,options)=>{ const body=JSON.parse(options.body); methods.push(body.method); return jsonResponse({jsonrpc:"2.0",id:1,result:{status:"success"}}); }});
  assert.deepEqual(methods,["get_payment"]); assert.equal(result.settled,true); assert.equal(result.evidenceSource,"fiber-rpc:get_payment");
});

test("v10 MCP endpoint validation rejects direct private-network HTTPS targets", () => {
  for(const url of ["https://10.0.0.5/mcp","https://192.168.1.2/mcp","https://169.254.169.254/latest"]) assert.throws(()=>validateMcpEndpoint(url),e=>e.code==="MCP_URL_PRIVATE");
  assert.match(validateMcpEndpoint("https://example.com/mcp"),/^https:/); assert.match(validateMcpEndpoint("http://127.0.0.1:3112/mcp"),/^http:/);
});

test("v10 UI exposes transaction building, Fiber settlement verification, and exact approval hashes", () => {
  const html=fs.readFileSync(path.join(process.cwd(),"public/index.html"),"utf8"); const app=fs.readFileSync(path.join(process.cwd(),"public/app.js"),"utf8");
  assert.match(html,/id="ckb-tx-builder-form"/); assert.match(html,/id="fiber-payment-status-form"/); assert.match(app,/\/api\/agent-commerce\/transaction-build/); assert.match(app,/\/api\/agent-commerce\/fiber-payment-status/); assert.match(app,/argumentsHash: approval\.argumentsHash/);
});


test("v10 HTTP exposes safe transaction-build and Fiber settlement verification endpoints", async () => {
  const root=tmp(), publicDir=path.join(root,"public"), data=path.join(root,"data"); fs.mkdirSync(publicDir); fs.mkdirSync(data); fs.writeFileSync(path.join(publicDir,"index.html"),"x");
  const methods=[];
  const server=createInspectorServer({
    publicDir,
    config:{ROOT_DIR:process.cwd(),DATA_DIR:data,APP_NETWORK:"testnet",CKB_RPC_URL:"",FIBER_RPC_URL:"http://127.0.0.1:8227",CKB_AGENT_WORKSPACE:"",CKB_GITHUB_TOKEN:"",PUBLIC_BASE_URL:"http://x",AI_ENABLED:true,AI_DEFAULT_PROVIDER:"openai",AI_DEFAULT_MODEL:"m",PUBLIC_DIRECTORY_ENABLED:false},
    learningOverview:()=>({summary:{}}), inspectCredential:async()=>({}),
    toolFetchImpl:async(_url,options)=>{ const body=JSON.parse(options.body); methods.push(body.method); return jsonResponse({jsonrpc:"2.0",id:1,result:{status:"success"}}); }
  });
  server.listen(0,"127.0.0.1"); await once(server,"listening");
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const buildResponse=await fetch(`${base}/api/agent-commerce/transaction-build`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({toLock:lock("22"),amountShannons:"10000000000",feeShannons:"1000",liveCells:[cell("aa",15000000000n)]})});
    assert.equal(buildResponse.status,200); const built=await buildResponse.json(); assert.equal(built.safety.signingAuthority,false); assert.equal(built.safety.broadcastAuthority,false);
    const paymentResponse=await fetch(`${base}/api/agent-commerce/fiber-payment-status`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({paymentHash:`0x${"ab".repeat(32)}`})});
    assert.equal(paymentResponse.status,200); const payment=await paymentResponse.json(); assert.equal(payment.settled,true); assert.deepEqual(methods,["get_payment"]);
  } finally { await new Promise(resolve=>server.close(resolve)); fs.rmSync(root,{recursive:true,force:true}); }
});


test("v10 multi-agent team exposes a parallel-specialist workflow DAG bound into its receipt", async () => {
  const root=tmp(), data=path.join(root,"data"); fs.mkdirSync(data); let n=0; const responses=["ecosystem evidence","security evidence","network evidence","CONDITIONAL GO: verify remaining live dependencies"];
  const result=await runAgentService({"x-ai-api-key":"key","x-ai-provider":"openai"},{serviceId:"ckb-launch-readiness-team",objective:"release testnet build"},{ROOT_DIR:process.cwd(),DATA_DIR:data,APP_NETWORK:"testnet",CKB_RPC_URL:"",FIBER_RPC_URL:"",CKB_AGENT_WORKSPACE:"",CKB_GITHUB_TOKEN:"",AI_DEFAULT_PROVIDER:"openai",AI_DEFAULT_MODEL:"m"},{fetchImpl:async()=>openAiText(responses[n++] ?? "done")});
  assert.equal(n,4); assert.equal(result.workflow.schema,"ckbuilder-agent-workflow/v1"); assert.equal(result.workflow.mode,"parallel-specialists-then-synthesis");
  const synthesis=result.workflow.nodes.find(node=>node.id==="synthesis"); assert.equal(synthesis.dependsOn.length,3); assert.ok(synthesis.dependsOn.every(id=>id.startsWith("role:"))); assert.equal(result.team.execution,"parallel-specialists-then-synthesis"); assert.match(result.receipt.workflowHash,/^sha256:/);
});


test("v10 MCP discovery uses the current stateless server/discover request", async () => {
  let request; const result=await discoverMcpServer("https://example.com/mcp",{fetchImpl:async(_url,options)=>{request=JSON.parse(options.body); return jsonResponse({jsonrpc:"2.0",id:request.id,result:{resultType:"complete",supportedVersions:[MCP_PROTOCOL_CURRENT],capabilities:{tools:{}},ttlMs:60000,cacheScope:"public"}});}});
  assert.equal(request.method,"server/discover"); assert.equal(request.params._meta["io.modelcontextprotocol/protocolVersion"],MCP_PROTOCOL_CURRENT); assert.ok(result.result.supportedVersions.includes(MCP_PROTOCOL_CURRENT));
});

test("v10 official CKB docs plugin exposes live CKB Dev Skills grounding", async () => {
  let seen=""; const runtime=await resolveAgentTools(["ckb-docs"],{rootDir:tmp(),fetchImpl:async url=>{seen=String(url); return new Response("CKB Dev Skills transaction Cell Script testing deployment",{status:200});}}); const tool=runtime.tools.find(item=>item.name.endsWith("ckb_dev_skills")); assert.ok(tool);
  const result=await runtime.execute(tool.name,{query:"transaction"}); assert.match(seen,/docs\/ai-agents\/ai-resource$/); assert.ok(result.matches.length>=1); assert.equal(result.freshness,"live official docs");
});
