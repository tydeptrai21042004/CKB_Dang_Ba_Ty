import fs from "node:fs";
import { AppError } from "./errors.js";
import { aiPluginCatalog, resolveAgentTools } from "./plugin-service.js";

const HEX = /^0x[0-9a-fA-F]*$/;
const H32 = /^0x[0-9a-fA-F]{64}$/;

function qty(value, label) {
  if (!/^0x[0-9a-fA-F]+$/.test(String(value ?? ""))) throw new AppError("CKB_TX_PREFLIGHT_INVALID", `${label} must be a hexadecimal quantity.`);
  return BigInt(value);
}
function amount(value, label) {
  const text = String(value ?? "").trim();
  if (!/^(?:0x[0-9a-fA-F]+|[0-9]+)$/.test(text)) throw new AppError("CKB_TX_BUILD_INVALID", `${label} must be a non-negative decimal or hexadecimal integer.`);
  return BigInt(text);
}
function hexQty(value) { return `0x${BigInt(value).toString(16)}`; }
function script(value, label, code = "CKB_TX_PREFLIGHT_INVALID") {
  const codeHash = String(value?.code_hash ?? value?.codeHash ?? "");
  const hashType = String(value?.hash_type ?? value?.hashType ?? "");
  const args = String(value?.args ?? "");
  if (!value || typeof value !== "object" || !H32.test(codeHash) || !["data", "type", "data1", "data2"].includes(hashType) || !HEX.test(args) || args.length % 2) {
    throw new AppError(code, `${label} is not a canonical CKB Script.`);
  }
  return { code_hash: codeHash, hash_type: hashType, args };
}

export function analyzeCkbTransaction(transaction) {
  if (!transaction || typeof transaction !== "object" || Array.isArray(transaction)) throw new AppError("CKB_TX_PREFLIGHT_INVALID", "transaction must be an object.");
  for (const key of ["cell_deps", "header_deps", "inputs", "outputs", "outputs_data", "witnesses"]) if (!Array.isArray(transaction[key])) throw new AppError("CKB_TX_PREFLIGHT_INVALID", `${key} must be an array.`);
  if (!transaction.inputs.length || !transaction.outputs.length) throw new AppError("CKB_TX_PREFLIGHT_INVALID", "transaction requires at least one input and output.");
  if (transaction.outputs.length !== transaction.outputs_data.length) throw new AppError("CKB_TX_PREFLIGHT_INVALID", "outputs and outputs_data length must match.");
  const warnings = []; const seen = new Set(); let total = 0n; let typeOutputs = 0; let dataBytes = 0;
  transaction.inputs.forEach((input, n) => {
    const p = input?.previous_output;
    if (!p || !H32.test(String(p.tx_hash ?? "")) || !/^0x[0-9a-fA-F]+$/.test(String(p.index ?? ""))) throw new AppError("CKB_TX_PREFLIGHT_INVALID", `inputs[${n}] previous_output is invalid.`);
    const key = `${p.tx_hash}:${p.index}`;
    if (seen.has(key)) warnings.push({ severity: "high", code: "DUPLICATE_INPUT", message: `Input ${n} spends the same out point twice.` });
    seen.add(key);
  });
  transaction.outputs.forEach((output, n) => {
    total += qty(output?.capacity, `outputs[${n}].capacity`);
    script(output?.lock, `outputs[${n}].lock`);
    if (output?.type) { script(output.type, `outputs[${n}].type`); typeOutputs += 1; }
    const data = String(transaction.outputs_data[n] ?? "");
    if (!HEX.test(data) || data.length % 2) throw new AppError("CKB_TX_PREFLIGHT_INVALID", `outputs_data[${n}] must be even-length hex.`);
    dataBytes += (data.length - 2) / 2;
  });
  if (transaction.witnesses.length < transaction.inputs.length) warnings.push({ severity: "medium", code: "WITNESS_COUNT_LOW", message: "Witness count is lower than input count; verify Script witness expectations." });
  if (!transaction.cell_deps.length) warnings.push({ severity: "medium", code: "NO_CELL_DEPS", message: "No cell_deps are declared; most non-trivial Scripts require dependencies." });
  const high = warnings.filter((x) => x.severity === "high").length, medium = warnings.filter((x) => x.severity === "medium").length;
  return {
    schema: "ckbuilder-ckb-tx-preflight/v1", valid: true,
    summary: { inputs: transaction.inputs.length, outputs: transaction.outputs.length, cellDeps: transaction.cell_deps.length, headerDeps: transaction.header_deps.length, witnesses: transaction.witnesses.length, typeOutputs, totalOutputCapacityShannons: total.toString(), outputDataBytes: dataBytes },
    warnings, riskScore: Math.min(100, high * 40 + medium * 15), riskLevel: high ? "high" : medium ? "medium" : "low",
    broadcastAuthority: false, signingAuthority: false
  };
}

function normalizeLiveCell(cell, index) {
  const out = cell?.out_point ?? cell?.outPoint;
  const output = cell?.output ?? cell?.cell_output ?? cell?.cellOutput;
  if (!out || !H32.test(String(out.tx_hash ?? out.txHash ?? "")) || !/^0x[0-9a-fA-F]+$/.test(String(out.index ?? ""))) throw new AppError("CKB_TX_BUILD_INVALID", `liveCells[${index}] out point is invalid.`);
  const capacity = qty(output?.capacity ?? cell?.capacity, `liveCells[${index}].capacity`);
  const lock = script(output?.lock ?? cell?.lock, `liveCells[${index}].lock`, "CKB_TX_BUILD_INVALID");
  return { outPoint: { tx_hash: String(out.tx_hash ?? out.txHash), index: String(out.index) }, capacity, lock };
}

export function buildCkbCapacityTransferIntent(input = {}) {
  if (!Array.isArray(input.liveCells) || !input.liveCells.length) throw new AppError("CKB_TX_BUILD_INVALID", "liveCells must contain one or more trusted/indexer-returned live Cells.");
  const target = amount(input.amountShannons ?? input.amount, "amountShannons");
  const requestedFee = amount(input.feeShannons ?? "1000", "feeShannons");
  if (target <= 0n) throw new AppError("CKB_TX_BUILD_INVALID", "amountShannons must be greater than zero.");
  const toLock = script(input.toLock, "toLock", "CKB_TX_BUILD_INVALID");
  const cells = input.liveCells.map(normalizeLiveCell);
  const changeLock = script(input.changeLock ?? cells[0].lock, "changeLock", "CKB_TX_BUILD_INVALID");
  const minChange = amount(input.minChangeCapacityShannons ?? "0", "minChangeCapacityShannons");
  const minTarget = amount(input.minTargetCapacityShannons ?? "0", "minTargetCapacityShannons");
  if (target < minTarget) throw new AppError("CKB_TX_BUILD_INVALID", "Requested target capacity is below minTargetCapacityShannons supplied by the caller.");

  const selected = []; let selectedCapacity = 0n;
  for (const cell of cells) {
    selected.push(cell); selectedCapacity += cell.capacity;
    if (selectedCapacity >= target + requestedFee) break;
  }
  if (selectedCapacity < target + requestedFee) throw new AppError("CKB_TX_BUILD_INSUFFICIENT_CAPACITY", "The supplied live Cells do not cover the requested amount plus fee.", { selectedCapacityShannons: selectedCapacity.toString(), requiredShannons: (target + requestedFee).toString() });
  const change = selectedCapacity - target - requestedFee;
  if (change > 0n && change < minChange) throw new AppError("CKB_TX_CHANGE_TOO_SMALL", "Change is below minChangeCapacityShannons. Increase fee intentionally, choose different Cells, or provide an appropriate minimum after occupied-capacity calculation.", { changeShannons: change.toString(), minChangeCapacityShannons: minChange.toString() });

  const outputs = [{ capacity: hexQty(target), lock: toLock, type: null }];
  if (change > 0n) outputs.push({ capacity: hexQty(change), lock: changeLock, type: null });
  const transaction = {
    version: "0x0", cell_deps: Array.isArray(input.cellDeps) ? input.cellDeps.slice(0, 64) : [], header_deps: [],
    inputs: selected.map((cell) => ({ previous_output: cell.outPoint, since: "0x0" })),
    outputs, outputs_data: outputs.map(() => "0x"), witnesses: selected.map(() => "0x")
  };
  return {
    schema: "ckbuilder-ckb-capacity-transfer-intent/v1",
    transaction,
    selection: { candidateCells: cells.length, selectedCells: selected.length, selectedCapacityShannons: selectedCapacity.toString(), amountShannons: target.toString(), requestedFeeShannons: requestedFee.toString(), changeShannons: change.toString() },
    staticAnalysis: analyzeCkbTransaction(transaction),
    safety: { unsigned: true, signingAuthority: false, broadcastAuthority: false, requiresHumanWalletApproval: true },
    caveats: [
      "CKBuilder does not calculate generic Script occupied capacity. Supply minTargetCapacityShannons/minChangeCapacityShannons from your application or CCC policy when required.",
      "Witnesses are placeholders. A wallet/CCC signing layer must construct the correct witness groups and sign outside the AI runtime.",
      "CellDeps must be supplied by the caller or resolved by a wallet/protocol-specific builder before dry-run/signing."
    ]
  };
}

export async function runCkbCapacityTransferBuilder(input = {}, config = {}, options = {}) {
  let liveCells = input.liveCells;
  let source = "caller-supplied";
  if (!Array.isArray(liveCells) || !liveCells.length) {
    if (!String(config.CKB_RPC_URL ?? "").trim()) throw new AppError("CKB_RPC_NOT_CONFIGURED", "Set CKB_RPC_URL or supply liveCells before building a capacity-transfer intent.");
    const fromLock = script(input.fromLock, "fromLock", "CKB_TX_BUILD_INVALID");
    const runtime = await resolveAgentTools(["ckb-rpc"], { rootDir: config.ROOT_DIR ?? options.rootDir, rpcUrl: config.CKB_RPC_URL, fetchImpl: options.toolFetchImpl ?? fetch, timeoutMs: options.toolTimeoutMs ?? 12000 });
    const tool = runtime.tools.find((x) => x.name.endsWith("ckb_rpc_cells_by_script"));
    const result = await runtime.execute(tool.name, { script: fromLock, scriptType: "lock", limit: Math.max(1, Math.min(100, Number(input.limit) || 100)), withData: false });
    liveCells = result?.objects ?? result?.cells ?? [];
    source = "ckb-indexer:get_cells";
  }
  const intent = buildCkbCapacityTransferIntent({ ...input, liveCells });
  return { ...intent, cellSource: source, fetchedCellCount: liveCells.length };
}

export async function runCkbTransactionPreflight(input, config = {}, options = {}) {
  const staticAnalysis = analyzeCkbTransaction(input?.transaction);
  if (input?.runDryRun === false) return { staticAnalysis, dryRun: { status: "skipped" }, safety: { broadcastCalled: false, signingCalled: false } };
  if (!String(config.CKB_RPC_URL ?? "").trim()) return { staticAnalysis, dryRun: { status: "not-configured", message: "Set CKB_RPC_URL for live dry_run_transaction evidence." }, safety: { broadcastCalled: false, signingCalled: false } };
  try {
    const runtime = await resolveAgentTools(["ckb-rpc"], { rootDir: config.ROOT_DIR ?? options.rootDir, rpcUrl: config.CKB_RPC_URL, fetchImpl: options.toolFetchImpl ?? fetch, timeoutMs: options.toolTimeoutMs ?? 12000 });
    const tool = runtime.tools.find((x) => x.name.endsWith("ckb_rpc_dry_run_transaction"));
    const result = await runtime.execute(tool.name, { transaction: input.transaction });
    return { staticAnalysis, dryRun: { status: "ok", result }, safety: { broadcastCalled: false, signingCalled: false } };
  } catch (error) {
    return { staticAnalysis, dryRun: { status: "error", code: String(error?.code ?? "RPC_ERROR"), message: String(error?.message ?? "Dry run failed.").slice(0, 1000) }, safety: { broadcastCalled: false, signingCalled: false } };
  }
}

export function agentRuntimeDoctor(config = {}, rootDir = process.cwd()) {
  const plugins = aiPluginCatalog(rootDir).map((plugin) => {
    let status = "ready", detail = "Available on demand.";
    if (plugin.id === "ckb-rpc" && !String(config.CKB_RPC_URL ?? "").trim()) { status = "needs-config"; detail = "Set CKB_RPC_URL."; }
    if (plugin.id === "fiber-rpc" && !String(config.FIBER_RPC_URL ?? "").trim()) { status = "needs-config"; detail = "Set FIBER_RPC_URL."; }
    if (plugin.id === "ckb-workspace") {
      const dir = String(config.CKB_AGENT_WORKSPACE ?? "");
      if (!dir) { status = "needs-config"; detail = "Set CKB_AGENT_WORKSPACE."; }
      else if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) { status = "invalid-config"; detail = "Configured workspace directory does not exist."; }
    }
    return { id: plugin.id, name: plugin.name, transport: plugin.transport, trust: plugin.trust, status, detail, permissions: plugin.permissions };
  });
  return {
    schema: "ckbuilder-agent-runtime-doctor/v1", aiEnabled: config.AI_ENABLED !== false, network: config.APP_NETWORK ?? "unknown",
    summary: { plugins: plugins.length, ready: plugins.filter((p) => p.status === "ready").length, needsAttention: plugins.filter((p) => p.status !== "ready").length },
    plugins,
    capabilities: { signedServiceReceipts: Boolean(config.DATA_DIR), sqliteAgentJobs: Boolean(config.DATA_DIR), transactionIntentBuilder: true, transactionDryRun: Boolean(config.CKB_RPC_URL), fiberSettlementVerification: Boolean(config.FIBER_RPC_URL), exactArgumentApprovals: true, workflowDag: true, parallelSpecialists: true, deterministicEvidenceScoring: true, resumableWorkflowCheckpoints: true, workflowRecoveryActions: true },
    safety: { signingAuthority: false, broadcastAuthority: false, autonomousSpend: false }
  };
}
