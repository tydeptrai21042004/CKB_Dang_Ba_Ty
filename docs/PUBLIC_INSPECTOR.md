# CKB Degree Proof v2.2 — Public Credential and Learning Console

## Purpose

The inspector is a reusable, read-only verifier. A verifier can check public credential evidence, optional document integrity, and live CKB Cell state without receiving the issuer's private key or controlling a wallet.

## Interfaces

### Credential inspection

```bash
npm run credential:inspect -- CKB-DEGREE-2026-0001 examples/certificate-original.pdf
```

Export a proof:

```bash
npm run credential:inspect -- CKB-DEGREE-2026-0001 examples/certificate-original.pdf --export=data/proof.json
```

### Raw Cell-data decoding

```bash
npm run cell:decode -- 0x...
npm run cell:decode -- data/revocations/example-active.bin
```

Optional expected values can be supplied through:

```bash
EXPECTED_CREDENTIAL_HASH=0x... EXPECTED_ISSUER_LOCK_HASH=0x... npm run cell:decode -- 0x...
```

### Exported-proof verification

```bash
npm run proof:verify -- data/proof.json
```

This recomputes the canonical digest, checks the schema and timestamp, and scans for obvious secret fields or absolute local paths.

## Browser and HTTP service

```bash
npm run inspector:serve
```

Open `http://127.0.0.1:4173`.

| Endpoint | Operation |
|---|---|
| `GET /api/health` | service/network/format discovery |
| `GET /api/learning` | evidence-derived learning progress |
| `POST /api/inspect` | credential and optional document inspection |
| `POST /api/decode-cell` | 75-byte raw Cell-data decoding |
| `POST /api/verify-proof` | exported-proof verification |

The server binds to localhost by default. Expose it publicly only behind deliberate deployment controls.

## Credential checks

- credential schema and ID binding;
- trusted issuer ID and CKB Lock Script hash;
- issuer Ed25519 signature;
- optional certificate SHA-256 hash;
- signed revocation-event credential and issuer binding;
- current live matching Cell through RPC;
- duplicate, conflicting, or malformed matching Cells;
- consistency between public credential and live Cell state;
- supplementary saved transaction lineage when available.

## Result states

| Outcome | Meaning |
|---|---|
| `ACTIVE_VALID` | Public record, document, and live active Cell agree |
| `ACTIVE_DOCUMENT_NOT_CHECKED` | Active state agrees but no document was provided |
| `REVOKED` | Evidence is intact and state is revoked |
| `STATE_MISMATCH` | Off-chain and live on-chain states disagree |
| `CONFLICT_DUPLICATE` | Multiple live matching Cells exist |
| `INVALID_CHAIN_RECORD` | Matching Cell data violates the binary rules |
| `INVALID_EVIDENCE` | Signature, binding, schema, or revocation evidence is invalid |
| `ONCHAIN_RECORD_NOT_FOUND` | Public record exists but no live Cell was found |
| `OFFCHAIN_RECORD_NOT_FOUND` | Live Cell exists but public credential record is absent |
| `CHAIN_NOT_CHECKED` | RPC check was intentionally skipped |
| `RPC_UNAVAILABLE` | Live RPC could not be queried |
| `NOT_FOUND` | Neither public credential nor live Cell was found |

## Community reuse

The binary format and no-dependency decoder are published under `docs/CREDENTIAL_CELL_DATA_FORMAT.md` and `community/`. They can be tested without a signer or CKB node.

## Honest protocol boundary

The Type Script enforces issuer ownership and irreversible `ACTIVE → REVOKED` state for one lineage. It does not prevent another independent lineage from being created with the same credential hash. Duplicate live records are reported as a conflict rather than silently choosing one.

## Learning dashboard

The browser console includes a separate learning hub. Its values are generated from `learning/progress.json` and the actual repository files. Included Rust source solutions are counted only when no unresolved markers remain. Academy, CCC Playground, and Cell Model tracks remain pending until their dedicated evidence files are added.

```bash
npm run learning:check
npm run learning:check:rust
```

The second command requires `rustc`; the first still performs deterministic source and manifest checks when Rust is unavailable.
