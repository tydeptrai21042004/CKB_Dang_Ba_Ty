#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "../lib/env.js";
import { closeProductDb, exportOperationalSnapshot, openProductDb } from "../lib/product-db.js";
import { loadLedger } from "../lib/ledger.js";
import { auditAttachmentStorage } from "../lib/attachment-service.js";
import { rootDir } from "./common.js";
const config=loadEnv(rootDir());
const stamp=new Date().toISOString().replace(/[:.]/g,"-");
const destination=path.resolve(process.argv[2]||path.join(config.DATA_DIR,"backups",`ckbuilder-full-${stamp}`));
const db=openProductDb(config.PRODUCT_DB_PATH);
try {
  const audit=auditAttachmentStorage(config,db); if(!audit.ok) throw new Error("Attachment audit failed; repair missing/tampered/orphaned evidence before creating a full backup.");
  fs.mkdirSync(destination,{recursive:true,mode:0o700});
  const manifest={schema:"ckbuilder-full-backup/v1",exportedAt:new Date().toISOString(),network:config.APP_NETWORK,product:exportOperationalSnapshot(db),ledger:loadLedger(config.DATA_DIR),attachmentAudit:audit};
  fs.writeFileSync(path.join(destination,"manifest.json"),`${JSON.stringify(manifest,null,2)}\n`,{mode:0o600});
  const source=path.join(config.DATA_DIR,"product-attachments"),target=path.join(destination,"attachments");
  if(fs.existsSync(source)){fs.cpSync(source,target,{recursive:true,preserveTimestamps:true});for(const file of fs.readdirSync(target,{recursive:true})){const full=path.join(target,file);try{if(fs.statSync(full).isFile())fs.chmodSync(full,0o600);else fs.chmodSync(full,0o700)}catch{}}}
  console.log(destination);
} finally { closeProductDb(db); }
