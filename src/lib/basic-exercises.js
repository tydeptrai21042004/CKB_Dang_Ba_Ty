import crypto from "node:crypto";

export const SHANNONS_PER_CKB = 100_000_000n;
export const U128_MAX = (1n << 128n) - 1n;

function toUnsignedBigInt(value, name, { allowZero = true } = {}) {
  let parsed;
  try {
    parsed = typeof value === "bigint" ? value : BigInt(value);
  } catch {
    throw new TypeError(`${name} must be an integer-compatible value.`);
  }
  if (parsed < 0n || (!allowZero && parsed === 0n)) {
    throw new RangeError(`${name} must be ${allowZero ? "non-negative" : "greater than zero"}.`);
  }
  return parsed;
}

export function ckbToShannons(value) {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,8})?$/.test(text)) {
    throw new TypeError("CKB amount must be a non-negative decimal with at most 8 fractional digits.");
  }
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * SHANNONS_PER_CKB + BigInt(fraction.padEnd(8, "0"));
}

export function shannonsToCkb(value) {
  const amount = toUnsignedBigInt(value, "Shannon amount");
  const whole = amount / SHANNONS_PER_CKB;
  const fraction = String(amount % SHANNONS_PER_CKB).padStart(8, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function planCkbTransfer({ inputCapacities, amount, fee = 0n }) {
  if (!Array.isArray(inputCapacities) || inputCapacities.length === 0) {
    throw new TypeError("inputCapacities must contain at least one Cell capacity.");
  }
  const inputs = inputCapacities.map((value, index) => toUnsignedBigInt(value, `inputCapacities[${index}]`, { allowZero: false }));
  const transferAmount = toUnsignedBigInt(amount, "amount", { allowZero: false });
  const feeAmount = toUnsignedBigInt(fee, "fee");
  const totalInput = inputs.reduce((sum, value) => sum + value, 0n);
  const required = transferAmount + feeAmount;
  if (totalInput < required) {
    throw new RangeError(`Insufficient input capacity: need ${required}, have ${totalInput}.`);
  }
  const change = totalInput - required;
  return {
    totalInput,
    recipientCapacity: transferAmount,
    changeCapacity: change,
    fee: feeAmount,
    balanced: totalInput === transferAmount + change + feeAmount
  };
}

export function utf8ToHex(value) {
  return `0x${Buffer.from(String(value), "utf8").toString("hex")}`;
}

export function hexToUtf8(value) {
  if (typeof value !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) {
    throw new TypeError("Hex data must start with 0x and contain complete bytes.");
  }
  return Buffer.from(value.slice(2), "hex").toString("utf8");
}

export function buildCellDataExercise(message) {
  const encoded = utf8ToHex(message);
  const decoded = hexToUtf8(encoded);
  return {
    message: String(message),
    encoded,
    dataBytes: Buffer.byteLength(String(message), "utf8"),
    decoded,
    roundTrip: decoded === String(message)
  };
}

export function encodeU128Le(value) {
  let amount = toUnsignedBigInt(value, "token amount");
  if (amount > U128_MAX) throw new RangeError("token amount exceeds unsigned 128-bit range.");
  const bytes = Buffer.alloc(16);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number(amount & 0xffn);
    amount >>= 8n;
  }
  return `0x${bytes.toString("hex")}`;
}

export function decodeU128Le(value) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{32}$/.test(value)) {
    throw new TypeError("xUDT amount data must be exactly 16 bytes of hex.");
  }
  const bytes = Buffer.from(value.slice(2), "hex");
  let amount = 0n;
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    amount = (amount << 8n) | BigInt(bytes[index]);
  }
  return amount;
}

export function planTokenTransfer({ senderBalance, amount }) {
  const balance = toUnsignedBigInt(senderBalance, "senderBalance");
  const transferAmount = toUnsignedBigInt(amount, "amount", { allowZero: false });
  if (transferAmount > balance) throw new RangeError("Token transfer amount exceeds sender balance.");
  const change = balance - transferAmount;
  return {
    inputAmount: balance,
    recipientAmount: transferAmount,
    changeAmount: change,
    recipientData: encodeU128Le(transferAmount),
    changeData: encodeU128Le(change),
    conserved: balance === transferAmount + change
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function buildDobExercise({ name, description = "", contentType, content }) {
  for (const [field, value] of Object.entries({ name, contentType, content })) {
    if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${field} is required.`);
  }
  const metadata = canonicalize({
    content: String(content),
    contentType: String(contentType),
    description: String(description),
    name: String(name)
  });
  const serialized = JSON.stringify(metadata);
  return {
    metadata,
    serialized,
    contentBytes: Buffer.byteLength(String(content), "utf8"),
    localIntegrityDigest: `0x${crypto.createHash("sha256").update(serialized).digest("hex")}`,
    note: "This digest is a local exercise checksum, not a Spore ID or CKB script hash."
  };
}

export function createHashLockChallenge(preimage) {
  if (typeof preimage !== "string" || preimage.length === 0) throw new TypeError("preimage is required.");
  return `0x${crypto.createHash("sha256").update(preimage, "utf8").digest("hex")}`;
}

export function verifyHashLock({ expectedHash, preimage }) {
  if (typeof expectedHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(expectedHash)) {
    throw new TypeError("expectedHash must be a 32-byte hex string.");
  }
  const actualHash = createHashLockChallenge(preimage);
  return {
    expectedHash: expectedHash.toLowerCase(),
    actualHash,
    unlocked: actualHash === expectedHash.toLowerCase(),
    note: "This is a local validation model. The official tutorial executes equivalent hash-lock logic in a CKB Script."
  };
}

export function runBasicExerciseSuite() {
  const transfer = planCkbTransfer({
    inputCapacities: [ckbToShannons("200"), ckbToShannons("100")],
    amount: ckbToShannons("120"),
    fee: 1_000n
  });
  const cellData = buildCellDataExercise("Hello CKB!");
  const token = planTokenTransfer({ senderBalance: 1_000n, amount: 250n });
  const dob = buildDobExercise({
    name: "CKBuilder Practice DOB",
    description: "Local metadata preparation exercise",
    contentType: "text/plain",
    content: "Built while learning the CKB Cell Model."
  });
  const preimage = "ckbuilder-local-hash-lock";
  const lock = verifyHashLock({ expectedHash: createHashLockChallenge(preimage), preimage });

  const exercises = [
    { id: "transfer-ckb", passed: transfer.balanced, result: transfer },
    { id: "store-data-on-cell", passed: cellData.roundTrip, result: cellData },
    { id: "create-fungible-token", passed: token.conserved && decodeU128Le(token.recipientData) === token.recipientAmount, result: token },
    { id: "create-dob", passed: dob.localIntegrityDigest.startsWith("0x") && dob.serialized.length > 0, result: dob },
    { id: "build-simple-lock", passed: lock.unlocked, result: lock }
  ];

  return {
    schema: "ckbuilder-basic-exercise-run/v1",
    mode: "local-deterministic-practice",
    passed: exercises.every((exercise) => exercise.passed),
    exercises
  };
}
