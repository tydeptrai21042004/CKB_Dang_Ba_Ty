#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { verifyAgentJobReceipt } from "../lib/agent-commerce-service.js";
const file=process.argv[2]; if(!file){console.error("Usage: npm run agent:receipt:verify -- <receipt-or-evidence-pack.json>");process.exit(2);}try{const body=JSON.parse(fs.readFileSync(path.resolve(file),"utf8"));const result=verifyAgentJobReceipt(body.receipt??body,{agreement:body.agreement??null,fulfillment:body.fulfillment??null});console.log(JSON.stringify(result,null,2));process.exit(result.valid?0:1);}catch(error){console.error(`[${error.code??"AGENT_RECEIPT_VERIFY_FAILED"}] ${error.message}`);process.exit(1);}
