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

- [x] Prepare Week 1 through Week 5 evidence-linked reports
- [ ] Record exact CKB Academy modules and scores
- [ ] Record CCC Playground exercises with screenshots
- [ ] Explain Cell Model concepts in the participant's own words
- [ ] Distinguish OffCKB devnet from a synchronized CKB full node
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
