# CKBuilder submission checklist

## Engineering

- [x] Working Node.js credential application
- [x] Public read-only credential inspector
- [x] No issuer private key required for verification
- [x] Document integrity and public proof export
- [x] Independent proof verification
- [x] Duplicate/conflicting live Cell detection
- [x] Revocation event bound to credential and issuer
- [x] Hardened HTTP security and upload handling
- [x] Custom Rust CKB Type Script
- [x] Registry input/output remains under issuer Lock Script
- [x] Positive and negative application tests
- [x] Expanded Rust unit/integration test source
- [x] Automatic environment and toolchain validation
- [x] GitHub Actions for Node.js and Rust
- [x] Mission Control with concrete CKB/Fiber/developer workflows
- [x] Bounded tool-using CKB agent runtime with visible audit trace
- [x] Persistent Ed25519 service identity and signed agent receipts
- [x] SQLite-backed private agent jobs and evidence-derived reputation
- [x] Exact tool + argument-hash approval for untrusted MCP operations
- [x] Unsigned CKB transaction intent builder and deterministic preflight
- [x] Read-only Fiber payment-status verification after external execution
- [x] Gemini 3 stateless function-call/thought-signature compatibility regression coverage
- [x] Runtime CI separated from clean-release audit
- [x] Public read-only Vercel deployment with no issuer private key loaded
- [x] Repository learning tracker complete at 61/61 (100%)
- [x] Dependency-aware AI workflow plans with deterministic evidence scoring
- [x] Tamper-detectable resumable workflow checkpoints and verification endpoint
- [x] CKB Agent Workflow Orchestrator multi-agent service
- [x] `.gitignore`, `.env.example`, `LICENSE`, and security notes

## Community contribution

- [x] Written 75-byte Cell-data specification
- [x] Dependency-free standalone decoder
- [x] Deterministic valid and malformed test vectors
- [x] Decoder CLI and HTTP endpoint
- [x] Contribution guide and issue templates
- [x] Upstream decoder proposal prepared
- [x] Deploy the hardened contract and create a fresh local OffCKB fixture
- [ ] Create a public testnet fixture only after programme-lead approval and safe testnet setup
- [ ] Open a real community issue/post with one specific review request
- [ ] Record feedback and the resulting code/documentation change

## Handbook evidence

- [x] Prepare Week 1 through Week 6 evidence-linked reports
- [x] Complete the repository learning tracker at 61/61 across all six tracked categories
- [x] Record eight Academy-aligned repository learning records
- [x] Record four CCC learning-path records
- [x] Record eight project-specific Cell Model explanations
- [x] Complete all 14 structured curriculum records
- [ ] Attach external Academy scores/certificates only if separately obtained
- [ ] Add live Testnet transaction evidence only after a real Testnet run
- [ ] Add the final GitHub repository URL

For a running local workspace:

```bash
npm run ci:runtime
```

Before publishing a **clean release copy/archive** (no runtime `.env`, `secrets/`, `node_modules/`, or PID/state files):

```bash
npm run ci:local
```

To reproduce the recorded deployment-tested contract version:

```bash
bash scripts/local-offckb-all.sh
```
