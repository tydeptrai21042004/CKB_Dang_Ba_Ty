import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateEnv } from "../src/lib/env.js";
import { buildKnownScripts, loadContractInfo } from "../src/ckb/offckb-config.js";
import { portableCredential } from "../src/lib/credential-artifact.js";

function env(network){return{APP_NETWORK:network,CKB_RPC_URL:"https://example.invalid",ISSUER_NAME:"Issuer",ISSUER_LOCK_HASH:`0x${"11".repeat(32)}`,DATA_DIR:"./data",ISSUER_PRIVATE_KEY_PATH:"./a",ISSUER_PUBLIC_KEY_PATH:"./b",TRUSTED_ISSUERS_FILE:"./c",REVOCATION_CONTRACT_BIN:"./d",CKB_ISSUER_PRIVATE_KEY_FILE:"./e",OFFCKB_SYSTEM_SCRIPTS:"./f",OFFCKB_DEPLOYMENT_SCRIPTS:"./g",OFFCKB_CHAIN_STATE:"./h",REQUIRE_CKB_RPC:"1"}}
test("mainnet is accepted by production environment validation",()=>assert.doesNotThrow(()=>validateEnv(env("mainnet"))));
test("network-aware deployment parser supports mainnet sections",()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),"ckb-net-"));const system=path.join(root,"system.json"),deploy=path.join(root,"deploy.json");fs.writeFileSync(system,JSON.stringify({mainnet:{secp256k1_blake160_sighash_all:{script:{codeHash:`0x${"11".repeat(32)}`,hashType:"type",cellDeps:[]}},dao:{script:{codeHash:`0x${"22".repeat(32)}`,hashType:"type",cellDeps:[]}}}}));fs.writeFileSync(deploy,JSON.stringify({mainnet:{"credential-revocation":{codeHash:`0x${"33".repeat(32)}`,hashType:"data1",cellDeps:[{}]}}}));assert.ok(buildKnownScripts(system,"mainnet").Secp256k1Blake160);assert.equal(loadContractInfo(deploy,"mainnet").hashType,"data1")});
test("portable builder credential exposes VC 2.0 context without raw student identity",()=>{const record={status:"ACTIVE",issuerPublicKeyPem:"PUBLIC",signature:"sig",payload:{schema:"ckbuilder-credential/v2",credentialId:"C1",credentialType:"BuilderMilestone",issuer:{issuerId:`0x${"01".repeat(32)}`,name:"CKBuilder",lockHash:`0x${"02".repeat(32)}`},subject:{recipientLockHash:`0x${"03".repeat(32)}`,identityCommitment:`0x${"04".repeat(32)}`},award:{title:"Type Script Builder",field:"CKB",classification:null,issuedAt:"2026-08-08"},document:{hashAlgorithm:"sha256",hash:`0x${"05".repeat(32)}`},createdAt:"2026-08-08T00:00:00.000Z"}};const vc=portableCredential(record,"https://passport.example");assert.equal(vc["@context"][0],"https://www.w3.org/ns/credentials/v2");assert.equal(JSON.stringify(vc).includes("identityCommitment"),true);assert.equal(vc.credentialSubject.id.includes(record.payload.subject.recipientLockHash),true)});
