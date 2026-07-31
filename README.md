# CKB Degree Proof v2.4.0

## Automatic End-to-End Credential and Learning Console

CKB Degree Proof is a CKBuilder capstone that demonstrates signed academic credentials, document-integrity verification, on-chain credential status, and a public read-only inspector on a local CKB development network.

The project retains its original application, Rust contract, tests, and evidence structure while extending them with:

- one-command environment setup and execution;
- automatic local OffCKB account selection;
- a Rust CKB Type Script for credential-state transitions;
- a public inspector that does not load an issuer private key;
- certificate hash and issuer-signature verification;
- duplicate, conflicting, and malformed Cell detection;
- exportable public verification proofs;
- a dependency-free Cell-data decoder and conformance vectors;
- reproducible community documentation and weekly CKBuilder reports.

> **Network boundary:** all transaction evidence in this repository belongs to an ephemeral local OffCKB devnet. No testnet or mainnet wallet, funds, or public explorer transaction was used.

## v2.4 guided learning workspace

Version 2.4 turns the Learning Hub into a guided, evidence-aware curriculum rather than a static resource list. It keeps the five runnable beginner exercises from v2.3 and adds 14 structured modules, 42 quiz questions, prerequisite-aware recommendations, searchable categories, lesson dialogs, copyable commands, and a persisted light/dark theme.

The new curriculum covers:

- CKB fundamentals, Cell capacity, transaction anatomy, Locks and Type Scripts;
- addresses, hashes, RPC, Indexer, CCC, and transaction construction;
- Molecule serialization, CKB-VM/RISC-V, Rust scripts, testing, and debugging;
- Fiber/Perun payment channels and capstone planning.

Current evidence-derived status is intentionally conservative:

| Track | Recorded result |
|---|---:|
| Included Rustlings foundation exercises | **22/22 corrected** |
| Guided curriculum modules | **0/14 completion records** |
| Official beginner tutorial evidence | **0/5 pending** |
| CKB Academy module evidence | **0/8 pending** |
| CCC learning evidence | **0/4 pending** |
| Total tracked learning evidence | **22/61 (36%)** |

Run the expanded learning system with:

```bash
npm run learning:check
npm run learning:quiz:list
npm run learning:quiz -- ckb-foundations
npm run learning:test
npm run exercises:run
```

Supporting learner files include [the eight-week study plan](learning/STUDY_PLAN.md), [the glossary](learning/GLOSSARY.md), [the dev-log template](learning/DEV_LOG_TEMPLATE.md), [the capstone brief](learning/CAPSTONE_BRIEF_TEMPLATE.md), and [the screenshot evidence guide](docs/SCREENSHOT_EVIDENCE_GUIDE.md).

![CKBuilder v2.4 Learning Hub](screenshots/09-v2.4-learning-hub.png)

![CKBuilder v2.4 lesson dialog](screenshots/10-v2.4-lesson-dialog.png)

## CKBuilder weekly reports

- [Week 1 — Initial credential application and Rust revocation contract](reports/week-01-report.md)
- [Week 2 — Public Credential Inspector and automatic end-to-end workflow](reports/week-02-report.md)
- [Week 3 — Structured CKB learning and FiberGuard community testing](reports/week-03-report.md)
- [Handbook progress tracker](HANDBOOK_PROGRESS.md)

The weekly reports distinguish formal handbook learning from capstone engineering and link to the corresponding screenshots, logs, test output, and machine-readable evidence.

## Run the complete project

From Ubuntu, Debian, WSL2, or macOS Terminal:

```bash
bash run-full-project.sh
```

The launcher checks the existing environment and reuses compatible tools before installing anything. It then:

1. validates Node.js, npm, Rust, Cargo, Make, and the RISC-V toolchain;
2. installs only missing prerequisites;
3. starts or reuses a local OffCKB node;
4. selects a prefunded local development account;
5. creates or reuses local issuer signing keys;
6. runs the JavaScript application and test suite;
7. builds and tests the Rust contract;
8. deploys the contract to local OffCKB;
9. uses one credential ID for the off-chain and on-chain workflow;
10. creates an `ACTIVE` Cell and consumes it into a `REVOKED` Cell;
11. exports and independently verifies a public proof;
12. starts the read-only browser inspector.

After completion, open:

```text
http://127.0.0.1:4173
```

No browser wallet, wallet extension, seed phrase, faucet, testnet token, or manual account import is required.

### Service commands

```bash
bash run-full-project.sh --status
bash run-full-project.sh --fast
bash run-full-project.sh --restart
bash run-full-project.sh --stop
npm run inspector:health
```

On Linux or WSL, `sudo` may be requested once if operating-system build packages are missing. Detailed setup notes are available in [docs/AUTOMATIC_END_TO_END_SETUP.md](docs/AUTOMATIC_END_TO_END_SETUP.md).

## Latest verified end-to-end run

The original complete on-chain v2.1.2 workflow was recorded on **22 July 2026**. The v2.4 learning/UI release was additionally validated on **31 July 2026** with 126 Node.js tests (125 passed, 0 failed, 1 optional dependency test skipped).

| Check | Result |
|---|---:|
| Node.js application, API, launcher, proof, and security tests | **74 passed, 0 failed** |
| Rust contract unit tests | **5 passed, 0 failed** |
| CKB `ckb-testtool` integration tests | **18 passed, 0 failed** |
| Contract deployment to local OffCKB | **Passed** |
| On-chain `ACTIVE` Cell creation | **Passed** |
| On-chain `ACTIVE → REVOKED` transition | **Passed** |
| Final live Cell query | **1 revoked, 0 active, 0 invalid** |
| Public inspector startup | **Passed** |
| Public proof verification | **Passed** |

### Latest local evidence

| Item | Value |
|---|---|
| Credential ID | `CKB-DEGREE-LOCAL-20260722215119-641` |
| Contract deployment transaction | `0x6c4be1ad765bf73df3ea12158e1843a0ed4090bedc5170d03647a09a335b97c4` |
| `ACTIVE` record transaction | `0x7088382fe933c059efd54069c3fe94c65d23307b9f2774179e2e35ca1791f9e3` |
| `REVOKED` record transaction | `0x9f4333b2425afbb65e40ae06f62c143f23d024b4f5a0f87b79c964e26189be78` |
| Issuer Lock Script hash | `0x7de82d61a7eb2ec82b0dc653e558ba120efcbfbb44dac87c12972d05bf250653` |
| Contract code hash | `0x92d8aca12b8e125b369f717c6e02a076d76500e508e1bdfa0ff0baab40c310a6` |
| Contract binary SHA-256 | `70b6d8d0ea6ca898921831fef16d95a9b7078560a4d70092c278f7694d395a01` |
| Public proof outcome | `REVOKED` |
| Public proof digest | `0xdfccadca6a43a5e6d39d24501ff842121bb0e6551585780f178be71e98fe717e` |

The corresponding machine-readable files are:

- [Week 2 run summary](evidence/week-02-run-summary.json)
- [Latest chain state](data/offckb-chain-state.json)
- [Deployment metadata](deployment/scripts.json)
- [Integrated public proof](data/automatic-public-verification-proof.json)
- [Sanitized complete terminal log](evidence/automatic-end-to-end-run-2026-07-22-sanitized.log)

## Week 2 screenshots

### Automatic setup, inspector readiness, and proof verification

![Automatic end-to-end startup completed](screenshots/04-automatic-end-to-end-success.png)

### Local OffCKB lifecycle and deployment evidence

![Local OffCKB lifecycle completed](screenshots/05-local-offckb-lifecycle-success.png)

### Final canonical `REVOKED` Cell

![Final revoked Cell state](screenshots/06-final-revoked-cell.png)

The screenshots were re-encoded before inclusion. The local Windows/WSL project path visible in the lifecycle screenshot was replaced with `<PROJECT_ROOT>`. Public local-devnet hashes, addresses, and transaction identifiers were retained as technical evidence. See [screenshots/SECURITY_REVIEW.md](screenshots/SECURITY_REVIEW.md).

## Week 1 historical evidence

The original Week 1 run remains available for comparison:

- ![Rust contract tests](screenshots/01-rust-contract-tests.png)
- ![Contract deployment](screenshots/02-contract-deployment.png)
- ![Original local lifecycle](screenshots/03-local-offckb-success.png)
- [Original sanitized log](evidence/local-offckb-run-sanitized.log)
- [Original run summary](evidence/run-summary.json)

## Public Credential Inspector

The inspector can:

- inspect a credential by ID without an issuer private key;
- verify the issuer signature and trusted CKB Lock Script hash;
- compare a certificate with its signed SHA-256 hash;
- query the live `ACTIVE` or `REVOKED` Cell through CKB RPC;
- report duplicate, conflicting, or malformed matching Cells;
- compare off-chain and on-chain state;
- display saved `ACTIVE → REVOKED` transaction evidence;
- export a machine-readable verification proof.

### CLI

```bash
npm run credential:inspect -- \
  CKB-DEGREE-2026-0001 \
  examples/certificate-original.pdf

npm run credential:inspect -- \
  CKB-DEGREE-2026-0001 \
  examples/certificate-original.pdf \
  --export=data/proof.json
```

### Browser interface

```bash
npm run inspector:serve
```

Then open `http://127.0.0.1:4173`.

See:

- [Public Inspector documentation](docs/PUBLIC_INSPECTOR.md)
- [v2 implementation guide](docs/V2_IMPLEMENTATION_GUIDE.md)
- [Automatic setup guide](docs/AUTOMATIC_END_TO_END_SETUP.md)

## Community interoperability package

The repository publishes reusable reference artifacts for other CKB tools:

- [Credential Cell data format](docs/CREDENTIAL_CELL_DATA_FORMAT.md)
- [Standalone decoder](community/decoder/credential-cell-decoder.js)
- [Deterministic test vectors](community/test-vectors/credential-cell-v1.json)
- [Public proof JSON schema](community/schemas/public-verification-proof-v2.schema.json)
- [Decoder integration proposal](docs/CKB_VIZ_DECODER_PROPOSAL.md)
- [Community contribution guide](docs/COMMUNITY_CONTRIBUTION.md)

Useful commands:

```bash
npm run cell:decode -- <0x-cell-data-or-file>
npm run proof:verify -- data/automatic-public-verification-proof.json
npm run test:vectors
npm run community:check
npm run manifest:export -- decoder-manifest.json
```

The public HTTP service also exposes:

```text
GET  /api/health
GET  /api/learning
POST /api/inspect
POST /api/decode-cell
POST /api/verify-proof
```

These materials are community reference artifacts and are not presented as an official CKB standard.

## Application design

### Off-chain credential layer

The Node.js application supports:

1. Ed25519 issuer-key initialization;
2. credential creation from degree data and a certificate file;
3. salted identity commitments instead of raw student IDs;
4. issuer-signature verification;
5. certificate SHA-256 verification;
6. recipient-binding verification;
7. duplicate credential prevention;
8. signed revocation records;
9. generation of the 75-byte Cell data consumed by the Rust contract.

### On-chain policy layer

The Rust Type Script protects each credential Cell lineage:

```text
creation:   no group input   -> one ACTIVE output
revocation: one ACTIVE input -> one REVOKED output
```

It rejects:

- unauthorized creation;
- creation or update under a foreign output Lock Script;
- creation directly in the revoked state;
- `REVOKED → ACTIVE` reactivation;
- credential-hash or issuer changes;
- registry-record destruction;
- malformed Cell data;
- multiple protected inputs or outputs;
- missing reason codes;
- missing revocation timestamps.

> **Protocol boundary:** the Type Script makes revocation irreversible for one Cell lineage. It does not yet guarantee global uniqueness against a separate independent `ACTIVE` Cell created with the same credential hash. The public inspector reports multiple matching live records as a conflict.

## Manual commands

### Application

```bash
cp .env.example .env
npm ci
npm run issuer:init
npm run ledger:reset
npm run credential:mint -- examples/degree-input.json examples/certificate-original.pdf
npm run credential:verify -- CKB-DEGREE-2026-0001 examples/certificate-original.pdf
npm run credential:revoke -- CKB-DEGREE-2026-0001 1 "Administrative correction"
npm run credential:verify -- CKB-DEGREE-2026-0001 examples/certificate-original.pdf
```

### Rust contract

```bash
cd digital-credentials-workspace
make build
make test
```

The release binary is generated at:

```text
digital-credentials-workspace/build/release/credential-revocation
```

## Repository structure

```text
.
├── community/                      standalone decoder, schemas, and test vectors
├── digital-credentials-workspace/  Rust Type Script and ckb-testtool tests
├── docs/                           architecture, setup, format, and limitations
├── evidence/                       sanitized logs and machine-readable summaries
├── examples/                       deterministic credential fixtures
├── learning/                       handbook learning records
├── public/                         no-build browser inspector
├── reports/                        Week 1, Week 2, and future report templates
├── screenshots/                    sanitized execution screenshots
├── scripts/                        environment, release, and automation scripts
├── src/                            Node.js application and CKB integration
└── test/                           application, HTTP, codec, proof, and launcher tests
```

## Security and release hygiene

Generated local configuration and keys are intentionally excluded from the public package:

```text
.env
secrets/
data/run/*.pid
data/logs/offckb-accounts.txt
```

The automatic launcher recreates the required local-only configuration and development keys on first run. See [SECURITY.md](SECURITY.md) and [screenshots/SECURITY_REVIEW.md](screenshots/SECURITY_REVIEW.md).
