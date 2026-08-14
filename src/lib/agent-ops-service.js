import fs from "node:fs";
import { AppError } from "./errors.js";
import { aiPluginCatalog, resolveAgentTools } from "./plugin-service.js";

const HEX=/^0x[0-9a-fA-F]*$/; const H32=/^0x[0-9a-fA-F]{64}$/;
function qty(v,label){ if(!/^0x[0-9a-fA-F]+$/.test(String(v??""))) throw new AppError("CKB_TX_PREFLIGHT_INVALID",`${label} must be a hexadecimal quantity.`); return BigInt(v); }
function script(s,label){ if(!s||typeof s!=="object"||!H32.test(String(s.code_hash??s.codeHash??""))||!["data","type","data1","data2"].includes(String(s.hash_type??s.hashType??""))||!HEX.test(String(s.args??""))||String(s.args??"").length%2) throw new AppError("CKB_TX_PREFLIGHT_INVALID",`${label} is not a canonical CKB Script.`); }
export function analyzeCkbTransaction(transaction){
  if(!transaction||typeof transaction!=="object"||Array.isArray(transaction)) throw new AppError("CKB_TX_PREFLIGHT_INVALID","transaction must be an object.");
  for(const key of ["cell_deps","header_deps","inputs","outputs","outputs_data","witnesses"]) if(!Array.isArray(transaction[key])) throw new AppError("CKB_TX_PREFLIGHT_INVALID",`${key} must be an array.`);
  if(!transaction.inputs.length||!transaction.outputs.length) throw new AppError("CKB_TX_PREFLIGHT_INVALID","transaction requires at least one input and output.");
  if(transaction.outputs.length!==transaction.outputs_data.length) throw new AppError("CKB_TX_PREFLIGHT_INVALID","outputs and outputs_data length must match.");
  const warnings=[]; const seen=new Set(); let total=0n; let typeOutputs=0; let dataBytes=0;
  transaction.inputs.forEach((i,n)=>{ const p=i?.previous_output; if(!p||!H32.test(String(p.tx_hash??""))||!/^0x[0-9a-fA-F]+$/.test(String(p.index??""))) throw new AppError("CKB_TX_PREFLIGHT_INVALID",`inputs[${n}] previous_output is invalid.`); const k=`${p.tx_hash}:${p.index}`; if(seen.has(k)) warnings.push({severity:"high",code:"DUPLICATE_INPUT",message:`Input ${n} spends the same out point twice.`}); seen.add(k); });
  transaction.outputs.forEach((o,n)=>{ total+=qty(o?.capacity,`outputs[${n}].capacity`); script(o?.lock,`outputs[${n}].lock`); if(o?.type){script(o.type,`outputs[${n}].type`);typeOutputs+=1;} const d=String(transaction.outputs_data[n]??""); if(!HEX.test(d)||d.length%2) throw new AppError("CKB_TX_PREFLIGHT_INVALID",`outputs_data[${n}] must be even-length hex.`); dataBytes+=(d.length-2)/2; });
  if(transaction.witnesses.length<transaction.inputs.length) warnings.push({severity:"medium",code:"WITNESS_COUNT_LOW",message:"Witness count is lower than input count; verify Script witness expectations."});
  if(!transaction.cell_deps.length) warnings.push({severity:"medium",code:"NO_CELL_DEPS",message:"No cell_deps are declared; most non-trivial Scripts require dependencies."});
  const high=warnings.filter(x=>x.severity==="high").length, medium=warnings.filter(x=>x.severity==="medium").length;
  return {schema:"ckbuilder-ckb-tx-preflight/v1",valid:true,summary:{inputs:transaction.inputs.length,outputs:transaction.outputs.length,cellDeps:transaction.cell_deps.length,headerDeps:transaction.header_deps.length,witnesses:transaction.witnesses.length,typeOutputs,totalOutputCapacityShannons:total.toString(),outputDataBytes:dataBytes},warnings,riskScore:Math.min(100,high*40+medium*15),riskLevel:high?"high":medium?"medium":"low",broadcastAuthority:false,signingAuthority:false};
}

export async function runCkbTransactionPreflight(input, config={}, options={}){
  const staticAnalysis=analyzeCkbTransaction(input?.transaction); if(input?.runDryRun===false) return {staticAnalysis,dryRun:{status:"skipped"}};
  if(!String(config.CKB_RPC_URL??"").trim()) return {staticAnalysis,dryRun:{status:"not-configured",message:"Set CKB_RPC_URL for live dry_run_transaction evidence."}};
  try{ const runtime=await resolveAgentTools(["ckb-rpc"],{rootDir:config.ROOT_DIR??options.rootDir,rpcUrl:config.CKB_RPC_URL,fetchImpl:options.toolFetchImpl??fetch,timeoutMs:options.toolTimeoutMs??12000}); const t=runtime.tools.find(x=>x.name.endsWith("ckb_rpc_dry_run_transaction")); const result=await runtime.execute(t.name,{transaction:input.transaction}); return {staticAnalysis,dryRun:{status:"ok",result},safety:{broadcastCalled:false,signingCalled:false}}; }
  catch(error){ return {staticAnalysis,dryRun:{status:"error",code:String(error?.code??"RPC_ERROR"),message:String(error?.message??"Dry run failed.").slice(0,1000)},safety:{broadcastCalled:false,signingCalled:false}}; }
}

export function agentRuntimeDoctor(config={},rootDir=process.cwd()){
  const plugins=aiPluginCatalog(rootDir).map((p)=>{ let status="ready"; let detail="Available on demand."; if(p.id==="ckb-rpc"&&!String(config.CKB_RPC_URL??"").trim()){status="needs-config";detail="Set CKB_RPC_URL.";} if(p.id==="fiber-rpc"&&!String(config.FIBER_RPC_URL??"").trim()){status="needs-config";detail="Set FIBER_RPC_URL.";} if(p.id==="ckb-workspace"){const dir=String(config.CKB_AGENT_WORKSPACE??""); if(!dir){status="needs-config";detail="Set CKB_AGENT_WORKSPACE.";} else if(!fs.existsSync(dir)||!fs.statSync(dir).isDirectory()){status="invalid-config";detail="Configured workspace directory does not exist.";}}
    return {id:p.id,name:p.name,transport:p.transport,trust:p.trust,status,detail,permissions:p.permissions}; });
  return {schema:"ckbuilder-agent-runtime-doctor/v1",aiEnabled:config.AI_ENABLED!==false,network:config.APP_NETWORK??"unknown",summary:{plugins:plugins.length,ready:plugins.filter(p=>p.status==="ready").length,needsAttention:plugins.filter(p=>p.status!=="ready").length},plugins,safety:{signingAuthority:false,broadcastAuthority:false,autonomousSpend:false}};
}
