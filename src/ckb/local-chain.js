import fs from "node:fs";
import path from "node:path";
import { ccc } from "@ckb-ccc/core";
import { buildKnownScripts, loadContractInfo } from "./offckb-config.js";
import {
  CHAIN_STATUS_ACTIVE,
  CHAIN_STATUS_REVOKED,
  credentialHash,
  decodeRevocationRecord,
  encodeRevocationRecord
} from "../lib/revocation-binary.js";
import { summarizeLiveRecords, validateDecodedRecord } from "./record-inspection.js";

function scriptJson(script) {
  return { codeHash: script.codeHash, hashType: script.hashType, args: script.args };
}

function outPointJson(outPoint) {
  return { txHash: outPoint.txHash, index: Number(outPoint.index) };
}

function readSecret(filePath) {
  const value = fs.readFileSync(filePath, "utf8").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`Invalid CKB private key in ${filePath}`);
  }
  return value;
}

function contractTypeScript(contract, issuerLockHash) {
  return ccc.Script.from({
    codeHash: contract.codeHash,
    hashType: contract.hashType,
    args: issuerLockHash
  });
}

/**
 * Read-only CKB context. It never reads or constructs a private key signer.
 */
export function createPublicDevnetContext(env) {
  const systemScriptsPath = path.resolve(env.OFFCKB_SYSTEM_SCRIPTS);
  const deploymentScriptsPath = path.resolve(env.OFFCKB_DEPLOYMENT_SCRIPTS);
  const scripts = buildKnownScripts(systemScriptsPath, env.APP_NETWORK);
  const Client = env.APP_NETWORK === "mainnet" ? ccc.ClientPublicMainnet : ccc.ClientPublicTestnet;
  if (!Client) throw new Error(`CCC does not expose a client for ${env.APP_NETWORK}.`);
  const client = new Client({ url: env.CKB_RPC_URL, scripts });
  const contract = loadContractInfo(deploymentScriptsPath, env.APP_NETWORK);
  const issuerLockHash = env.ISSUER_LOCK_HASH.toLowerCase();
  const typeScript = contractTypeScript(contract, issuerLockHash);
  return { client, contract, issuerLockHash, typeScript };
}

export function createDevnetContext(env) {
  const publicContext = createPublicDevnetContext(env);
  const privateKeyPath = path.resolve(env.CKB_ISSUER_PRIVATE_KEY_FILE);
  const signer = new ccc.SignerCkbPrivateKey(publicContext.client, readSecret(privateKeyPath));
  return { ...publicContext, signer };
}

export async function deriveIssuer(env) {
  const systemScriptsPath = path.resolve(env.OFFCKB_SYSTEM_SCRIPTS);
  const privateKeyPath = path.resolve(env.CKB_ISSUER_PRIVATE_KEY_FILE);
  const scripts = buildKnownScripts(systemScriptsPath, env.APP_NETWORK);
  const Client = env.APP_NETWORK === "mainnet" ? ccc.ClientPublicMainnet : ccc.ClientPublicTestnet;
  if (!Client) throw new Error(`CCC does not expose a client for ${env.APP_NETWORK}.`);
  const client = new Client({ url: env.CKB_RPC_URL, scripts });
  const signer = new ccc.SignerCkbPrivateKey(client, readSecret(privateKeyPath));
  const address = await signer.getAddressObjSecp256k1();
  return {
    address: address.toString(),
    lockScript: scriptJson(address.script),
    lockHash: address.script.hash()
  };
}

function contractCellDeps(contract) {
  if (!Array.isArray(contract.cellDeps) || contract.cellDeps.length === 0) {
    throw new Error("The deployment record has no contract Cell dependency.");
  }
  return contract.cellDeps.map((entry) => entry.cellDep ?? entry);
}

async function prepareAndSend({ tx, signer, client }) {
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 1000n);
  const txHash = await signer.sendTransaction(tx);
  const confirmed = await client.waitTransaction(txHash);
  if (confirmed.status !== "committed") {
    throw new Error(`Transaction ${txHash} did not commit; status=${confirmed.status}`);
  }
  return txHash;
}

export async function createActiveRecord(env, credentialId) {
  const { client, signer, contract, typeScript } = createDevnetContext(env);
  const issuer = await signer.getAddressObjSecp256k1();
  const issuerLock = issuer.script;
  const issuerLockHash = issuerLock.hash();
  if (issuerLockHash.toLowerCase() !== env.ISSUER_LOCK_HASH.toLowerCase()) {
    throw new Error("ISSUER_LOCK_HASH does not match the selected OffCKB account.");
  }

  const existing = await findLiveRecords(client, typeScript, credentialId, issuerLockHash);
  if (existing.length > 0) {
    const summary = summarizeLiveRecords(existing);
    throw new Error(`A live registry record already exists for ${credentialId}; status=${summary.status}.`);
  }

  const record = encodeRevocationRecord({
    status: CHAIN_STATUS_ACTIVE,
    credentialId,
    issuerLockHash,
    reasonCode: 0,
    revokedAt: 0n
  });
  const outputData = `0x${record.toString("hex")}`;
  const output = ccc.CellOutput.from({ lock: issuerLock, type: typeScript }, outputData);
  const tx = ccc.Transaction.from({
    cellDeps: contractCellDeps(contract),
    outputs: [output],
    outputsData: [outputData]
  });
  const txHash = await prepareAndSend({ tx, signer, client });
  return {
    credentialId,
    credentialHash: credentialHash(credentialId),
    status: "ACTIVE",
    txHash,
    outPoint: { txHash, index: 0 },
    issuerLockHash,
    typeScript: scriptJson(typeScript)
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function findLiveRecords(client, typeScript, credentialId, issuerLockHash) {
  const expectedHash = credentialHash(credentialId).toLowerCase();
  const matches = [];
  for await (const cell of client.findCells({
    script: typeScript,
    scriptType: "type",
    scriptSearchMode: "exact",
    withData: true
  })) {
    try {
      const data = Buffer.from(cell.outputData.slice(2), "hex");
      const record = decodeRevocationRecord(data);
      if (record.credentialHash.toLowerCase() !== expectedHash) continue;
      matches.push({
        outPoint: outPointJson(cell.outPoint),
        cell,
        record,
        errors: validateDecodedRecord(record, issuerLockHash, expectedHash)
      });
    } catch {
      // The shared issuer Type Script can protect many credentials. Malformed data
      // without a decodable credential hash cannot safely be attributed to this ID.
    }
  }
  return matches;
}

async function waitForUniqueActiveRecord(client, typeScript, credentialId, issuerLockHash, attempts = 45) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const matches = await findLiveRecords(client, typeScript, credentialId, issuerLockHash);
    const summary = summarizeLiveRecords(matches);
    if (summary.status === "CONFLICT_DUPLICATE") {
      throw new Error(`Conflicting live registry records exist for ${credentialId}; revocation is refused.`);
    }
    if (summary.status === "INVALID_RECORD") {
      throw new Error(`The live registry record for ${credentialId} is malformed; revocation is refused.`);
    }
    if (summary.status === "REVOKED") {
      throw new Error(`Credential ${credentialId} is already REVOKED on chain.`);
    }
    if (summary.status === "ACTIVE") {
      return matches.find((entry) => entry.errors.length === 0 && entry.record.status === CHAIN_STATUS_ACTIVE);
    }
    if (attempt < attempts) await sleep(1000);
  }
  return undefined;
}

export async function revokeRecord(env, credentialId, reasonCode = 1) {
  const { client, signer, contract, typeScript, issuerLockHash } = createDevnetContext(env);
  const issuer = await signer.getAddressObjSecp256k1();
  const issuerLock = issuer.script;
  if (issuerLock.hash().toLowerCase() !== issuerLockHash) {
    throw new Error("Configured issuer signer does not match ISSUER_LOCK_HASH.");
  }
  const active = await waitForUniqueActiveRecord(client, typeScript, credentialId, issuerLockHash);
  if (!active) throw new Error(`No live ACTIVE registry Cell found for ${credentialId}.`);

  const revokedAt = BigInt(Math.floor(Date.now() / 1000));
  const record = encodeRevocationRecord({
    status: CHAIN_STATUS_REVOKED,
    credentialId,
    issuerLockHash,
    reasonCode,
    revokedAt
  });
  const outputData = `0x${record.toString("hex")}`;
  const output = ccc.CellOutput.from(
    { capacity: active.cell.cellOutput.capacity, lock: issuerLock, type: typeScript },
    outputData
  );
  const tx = ccc.Transaction.from({
    cellDeps: contractCellDeps(contract),
    outputs: [output],
    outputsData: [outputData]
  });
  tx.addInput(active.cell);
  const txHash = await prepareAndSend({ tx, signer, client });
  return {
    credentialId,
    status: "REVOKED",
    reasonCode,
    revokedAt: revokedAt.toString(),
    txHash,
    outPoint: { txHash, index: 0 },
    spentActiveOutPoint: active.outPoint
  };
}

/**
 * Inspect the live credential Cell without loading an issuer private key.
 */
export async function inspectRecord(env, credentialId, options = {}) {
  const { client, typeScript, issuerLockHash } = createPublicDevnetContext(env);
  const attempts = Number(options.attempts ?? 20);
  let matches = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    matches = await findLiveRecords(client, typeScript, credentialId, issuerLockHash);
    if (matches.length > 0 || attempt === attempts) break;
    await sleep(Number(options.delayMs ?? 1000));
  }
  return {
    ...summarizeLiveRecords(matches),
    readOnly: true,
    network: env.APP_NETWORK,
    rpcUrl: env.CKB_RPC_URL,
    issuerLockHash,
    typeScript: scriptJson(typeScript)
  };
}
