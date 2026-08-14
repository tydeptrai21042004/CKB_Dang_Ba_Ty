#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { analyzeCkbTransaction } from "../lib/agent-ops-service.js";
const file=process.argv[2]; if(!file){console.error("Usage: npm run agent:tx:preflight -- <transaction.json>");process.exit(2);}try{const body=JSON.parse(fs.readFileSync(path.resolve(file),"utf8"));const result=analyzeCkbTransaction(body.transaction??body);console.log(JSON.stringify(result,null,2));process.exit(result.riskLevel==="high"?1:0);}catch(error){console.error(`[${error.code??"CKB_TX_PREFLIGHT_FAILED"}] ${error.message}`);process.exit(1);}
