#!/usr/bin/env node
import { loadEnv } from "../lib/env.js";
import { auditAttachmentStorage } from "../lib/attachment-service.js";
import { closeProductDb, openProductDb } from "../lib/product-db.js";
import { rootDir } from "./common.js";
const config=loadEnv(rootDir()); const db=openProductDb(config.PRODUCT_DB_PATH);
try { const result=auditAttachmentStorage(config,db); console.log(JSON.stringify(result,null,2)); if(!result.ok) process.exitCode=2; } finally { closeProductDb(db); }
