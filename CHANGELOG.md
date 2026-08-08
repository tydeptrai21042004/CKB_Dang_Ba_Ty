# Changelog

## 5.0.0 — 2026-08-08

- Added safe HTML/TXT/Markdown/JSON/PDF/image document handling and deterministic document inspection.
- Added sanitized sandboxed HTML preview with active-content and attribute stripping.
- Added printable escaped HTML credential output with a restrictive CSP.
- Added private submission evidence attachments with tracking-token authorization and reviewer-only access.
- Added raw-download vs safe-preview separation and read-time SHA-256 integrity checks.
- Extended BYOK AI extraction to HTML/TXT/Markdown/JSON while preserving image vision and deterministic-only PDF handling.
- Added attachment storage integrity audit and full private backup tooling.
- Added dedicated v5 document, HTTP, issuer, UI, and storage security tests.

## 4.0.0 — 2026-08-08

- Added submission timelines, cancellation, and controlled resubmission.
- Added opt-in public credential directory, stats, and readiness APIs.
- Added issuer dashboard, review search/filtering, bulk intake, operation/webhook inspection, and operational export.
- Added HMAC-signed HTTPS webhooks with SSRF protections.
- Added Google Gemini as an optional BYOK AI provider.
- Added backup export CLI and production configuration checks.
- Added dedicated v4 product, HTTP, issuer, AI, and webhook regression/security tests.

## 2.4.0 - 2026-07-31

- Rebuilt the Learning Hub as a searchable, filterable curriculum workspace with prerequisite-aware next-step recommendations.
- Added a responsive lesson dialog with outcomes, checkpoints, practical labs, commands, references, and evidence instructions.
- Added persistent light/dark themes, improved navigation hierarchy, progress meters, and mobile layouts.
- Added 14 structured learning modules with 42 validated quiz questions.
- Added an interactive quiz runner plus deterministic quiz grading tests.
- Added an eight-week study plan, CKB glossary, weekly dev-log template, capstone brief template, and per-module evidence templates.
- Expanded learning progress calculations to distinguish available, planned, and completed modules without fabricating completion.
- Increased the automated suite to 126 tests: 125 passed, 0 failed, and 1 optional CCC dependency test skipped.


## 2.3.0 - 2026-07-31

- Added deterministic runnable practice models for five official beginner CKB tutorials.
- Added 27 focused tests covering transfers, Cell data, xUDT amounts, DOB metadata, hash locks, catalogs, and evidence safety.
- Expanded the Learning Hub with official tutorial cards, CCC resources, SDKs, developer tools, Fiber, and Perun.
- Added per-tutorial evidence templates and a cross-platform screenshot guide.
- Preserved honest progress reporting: templates and local simulations do not count as official completion.
- Added `exercises:run`, `exercises:test`, and `exercises:evidence` commands.

## 2.2.0 — 2026-07-31

### Added

- Responsive five-workspace browser console for overview, credential inspection, Cell decoding, proof verification, and learning evidence.
- Read-only `GET /api/learning` endpoint derived from repository evidence.
- Learning manifest, progress calculator, source checker, Rust-aware compilation mode, templates, and Cell Model concept guide.
- Dashboard and learning-hub preview screenshots.
- UI and learning regression tests.

### Fixed

- Restored executable permissions for root and setup launcher scripts.
- Restored the required `.env.example` and `.gitignore` release files.
- Corrected and normalized all 22 included Rustlings foundation solutions.
- Removed unresolved exercise markers from solved Rust source.
- Prevented dynamic UI errors from being inserted through `innerHTML`.

### Accuracy

- Academy, CCC Playground, and learner-authored Cell Model evidence remain pending until real evidence files exist. Capstone features are not counted as formal course completion.

## 2.1.2 - 2026-07-22

### Fixed

- Fixed a false-negative inspector startup failure in the one-command launcher.
- The health checker now accepts both compact JSON (`"ok":true`) and pretty-printed JSON (`"ok": true`).
- Added a reusable health-response parser and a regression test for the exact response format returned by `/api/health`.
- Startup failures now print the direct health response and inspector log for diagnosis.

### Documentation and evidence update

- Added professional Week 1 and Week 2 reports with direct evidence links.
- Added three Week 2 screenshots for the successful automatic run, lifecycle completion, and final `REVOKED` Cell.
- Added a sanitized complete end-to-end terminal log and machine-readable Week 2 run summary.
- Updated README, test status, handbook tracker, requirements matrix, and submission checklist to the latest verified results.
- Removed generated `.env`, issuer private keys, OffCKB private-account listings, and stale PID files from the distributable package.

## 2.1.1 — Automatic end-to-end launcher

### Added

- Root `run-full-project.sh` launcher for environment detection, installation, local account selection, full build/test/deploy/lifecycle, and inspector startup.
- `--fast`, `--status`, `--restart`, `--stop`, `--foreground`, and `--no-install` modes.
- Persistent project-owned PID files and safe service shutdown that does not terminate an external OffCKB node.
- Machine-readable `data/run/launch-summary.json` after a successful run.
- Integrated public-proof export using the same credential ID across the off-chain and on-chain lifecycle.
- Automatic-launcher tests and complete setup documentation.

### Changed

- The local OffCKB runner can keep its node alive through `nohup` and records its managed PID.
- Existing compatible Node, npm, Rust, toolchain, dependency, key, configuration, RPC, and service state is reused where possible.
- The documented primary run command no longer requires manual wallet or account setup.
- `.env` files are parsed as data rather than executed as shell code.
- The launcher forces a loopback-only RPC and refuses non-local endpoints.

## 2.1.0 — Community interoperability and policy hardening

### Added

- Dependency-free credential Cell-data decoder under `community/decoder/`.
- Deterministic valid and malformed cross-implementation test vectors.
- Written `ckb-degree-credential-cell/v1` binary specification.
- Cell-data decoder CLI and HTTP endpoint.
- Independent public-proof digest/privacy verifier CLI and HTTP endpoint.
- Hardened, testable HTTP server module with security headers, request IDs, content-type checks, path-traversal protection, and upload limits.
- Community contribution guide, issue templates, pull-request template, licence, and conduct guidance.
- Handbook progress matrix and evidence-first weekly-report/learning templates.
- Expanded Node.js tests for codec, proof integrity, HTTP security, configuration parsing, and conformance vectors.
- Additional Rust unit and integration test cases.

### Changed

- Type Script now requires protected input/output registry Cells to use the issuer Lock Script hash stored in Type Script args.
- Immutable issuer/version changes during update receive an explicit immutable-field failure.
- Record JSON now includes status names, reason names, canonical validation state, and ISO revocation time where representable.
- OffCKB system/deployment parsing is isolated from CCC so pure configuration tests run without network dependencies.

### Known limitation

- Global credential-hash uniqueness across independently created Cell lineages remains unenforced by the Type Script. Clients prevent ordinary duplicate creation and the inspector reports duplicate live records as conflicts.

## 2.0.0 — Public Credential Inspector

- Added no-private-key public credential inspection.
- Added off-chain/on-chain state comparison and proof export.
- Added browser interface and duplicate/malformed Cell reporting.
- Fixed revocation timestamp rollback and signed-event binding defects.
