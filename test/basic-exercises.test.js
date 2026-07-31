import assert from "node:assert/strict";
import test from "node:test";
import {
  U128_MAX,
  buildCellDataExercise,
  buildDobExercise,
  canonicalJson,
  ckbToShannons,
  createHashLockChallenge,
  decodeU128Le,
  encodeU128Le,
  hexToUtf8,
  planCkbTransfer,
  planTokenTransfer,
  runBasicExerciseSuite,
  shannonsToCkb,
  utf8ToHex,
  verifyHashLock
} from "../src/lib/basic-exercises.js";

test("CKB decimal conversion supports whole and fractional amounts", () => {
  assert.equal(ckbToShannons("1"), 100_000_000n);
  assert.equal(ckbToShannons("1.00000001"), 100_000_001n);
  assert.equal(shannonsToCkb(125_000_000n), "1.25");
});

test("CKB decimal conversion rejects excess precision and negative values", () => {
  assert.throws(() => ckbToShannons("1.000000001"), /at most 8/);
  assert.throws(() => ckbToShannons("-1"), /non-negative/);
});

test("transfer planner preserves capacity with change and fee", () => {
  const result = planCkbTransfer({ inputCapacities: [200n, 100n], amount: 120n, fee: 3n });
  assert.deepEqual(result, {
    totalInput: 300n,
    recipientCapacity: 120n,
    changeCapacity: 177n,
    fee: 3n,
    balanced: true
  });
});

test("transfer planner supports exact spending with no change", () => {
  const result = planCkbTransfer({ inputCapacities: [100n], amount: 99n, fee: 1n });
  assert.equal(result.changeCapacity, 0n);
  assert.equal(result.balanced, true);
});

test("transfer planner rejects insufficient and malformed inputs", () => {
  assert.throws(() => planCkbTransfer({ inputCapacities: [10n], amount: 11n }), /Insufficient/);
  assert.throws(() => planCkbTransfer({ inputCapacities: [], amount: 1n }), /at least one/);
  assert.throws(() => planCkbTransfer({ inputCapacities: [0n], amount: 1n }), /greater than zero/);
});

test("UTF-8 Cell data round-trips ASCII and Unicode", () => {
  for (const message of ["Hello CKB!", "CKB 学习 🚀", ""]) {
    assert.equal(hexToUtf8(utf8ToHex(message)), message);
  }
});

test("Cell data helper reports encoded byte length", () => {
  const result = buildCellDataExercise("A🚀");
  assert.equal(result.dataBytes, 5);
  assert.equal(result.roundTrip, true);
});

test("hex decoder rejects incomplete or non-hex data", () => {
  assert.throws(() => hexToUtf8("0x1"), /complete bytes/);
  assert.throws(() => hexToUtf8("hello"), /start with 0x/);
});

test("u128 little-endian encoding handles boundary values", () => {
  for (const amount of [0n, 1n, 255n, 256n, U128_MAX]) {
    assert.equal(decodeU128Le(encodeU128Le(amount)), amount);
  }
  assert.equal(encodeU128Le(1n), "0x01000000000000000000000000000000");
});

test("u128 encoding rejects overflow and malformed data", () => {
  assert.throws(() => encodeU128Le(U128_MAX + 1n), /exceeds/);
  assert.throws(() => decodeU128Le("0x01"), /16 bytes/);
});

test("token transfer conserves amount and emits xUDT-compatible data", () => {
  const result = planTokenTransfer({ senderBalance: 1_000n, amount: 250n });
  assert.equal(result.changeAmount, 750n);
  assert.equal(result.conserved, true);
  assert.equal(decodeU128Le(result.recipientData), 250n);
  assert.equal(decodeU128Le(result.changeData), 750n);
});

test("token transfer rejects overspending and zero transfer", () => {
  assert.throws(() => planTokenTransfer({ senderBalance: 100n, amount: 101n }), /exceeds/);
  assert.throws(() => planTokenTransfer({ senderBalance: 100n, amount: 0n }), /greater than zero/);
});

test("canonical JSON is independent of object insertion order", () => {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, b: 3 } }), canonicalJson({ a: { b: 3, y: 2 }, z: 1 }));
});

test("DOB exercise produces deterministic metadata checksum", () => {
  const first = buildDobExercise({ name: "Demo", contentType: "text/plain", content: "hello", description: "test" });
  const second = buildDobExercise({ content: "hello", name: "Demo", description: "test", contentType: "text/plain" });
  assert.equal(first.serialized, second.serialized);
  assert.equal(first.localIntegrityDigest, second.localIntegrityDigest);
  assert.match(first.note, /not a Spore ID/);
});

test("DOB exercise checksum changes with content", () => {
  const first = buildDobExercise({ name: "Demo", contentType: "text/plain", content: "hello" });
  const second = buildDobExercise({ name: "Demo", contentType: "text/plain", content: "changed" });
  assert.notEqual(first.localIntegrityDigest, second.localIntegrityDigest);
});

test("DOB exercise requires core metadata fields", () => {
  assert.throws(() => buildDobExercise({ name: "", contentType: "text/plain", content: "hello" }), /name is required/);
});

test("hash-lock accepts the correct preimage", () => {
  const preimage = "correct horse battery staple";
  const expectedHash = createHashLockChallenge(preimage);
  assert.equal(verifyHashLock({ expectedHash, preimage }).unlocked, true);
});

test("hash-lock rejects an incorrect preimage", () => {
  const expectedHash = createHashLockChallenge("right");
  assert.equal(verifyHashLock({ expectedHash, preimage: "wrong" }).unlocked, false);
});

test("hash-lock validates expected hash and preimage", () => {
  assert.throws(() => createHashLockChallenge(""), /required/);
  assert.throws(() => verifyHashLock({ expectedHash: "0x12", preimage: "x" }), /32-byte/);
});

test("all five local basic exercise models run successfully", () => {
  const suite = runBasicExerciseSuite();
  assert.equal(suite.schema, "ckbuilder-basic-exercise-run/v1");
  assert.equal(suite.exercises.length, 5);
  assert.equal(suite.passed, true);
  assert.deepEqual(suite.exercises.map((item) => item.id), [
    "transfer-ckb",
    "store-data-on-cell",
    "create-fungible-token",
    "create-dob",
    "build-simple-lock"
  ]);
});
