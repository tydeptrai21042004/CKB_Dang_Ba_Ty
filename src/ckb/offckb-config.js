import fs from "node:fs";

const CONTRACT_NAME = "credential-revocation";
function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
function requireFile(filePath, label) { if (!fs.existsSync(filePath)) throw new Error(`${label} is missing: ${filePath}`); return filePath; }
function configNetwork(network = "devnet") { return network === "local" ? "devnet" : network; }

/** Convert a network system-scripts.json section to CCC's known-script map. */
export function buildKnownScripts(systemScriptsPath, network = "devnet") {
  const root = readJson(requireFile(systemScriptsPath, "CKB system scripts"));
  const key = configNetwork(network);
  const scripts = root?.[key];
  if (!scripts) throw new Error(`deployment/system-scripts.json does not contain ${key} scripts.`);
  const required = {
    Secp256k1Blake160: scripts.secp256k1_blake160_sighash_all?.script,
    NervosDao: scripts.dao?.script
  };
  const optional = {
    Secp256k1Multisig: scripts.secp256k1_blake160_multisig_all?.script,
    AnyoneCanPay: scripts.anyone_can_pay?.script,
    OmniLock: scripts.omnilock?.script,
    XUdt: scripts.xudt?.script,
    TypeId: scripts.type_id?.script ?? { codeHash: "0x00000000000000000000000000000000000000000000000000545950455f4944", hashType: "type", cellDeps: [] }
  };
  for (const [name, value] of Object.entries(required)) if (!value) throw new Error(`Required ${key} known Script is missing: ${name}`);
  return Object.fromEntries(Object.entries({ ...required, ...optional }).filter(([, value]) => value));
}

export function loadContractInfo(deploymentScriptsPath, network = "devnet") {
  const root = readJson(requireFile(deploymentScriptsPath, "CKB deployment scripts"));
  const key = configNetwork(network);
  const entries = root?.[key] ?? {};
  const exact = entries[CONTRACT_NAME];
  if (exact) return exact;
  const found = Object.entries(entries).find(([name]) => name.replace(/\.(bc|bin)$/i, "") === CONTRACT_NAME);
  if (!found) throw new Error(`Cannot find ${CONTRACT_NAME} for ${key} in ${deploymentScriptsPath}.`);
  return found[1];
}
