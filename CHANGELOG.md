# Changelog

## 10.2.0 — 2026-08-19

### Week 6 learning completion

- Completed the repository learning tracker from **22/61 (36%)** to **61/61 (100%)** across Rustlings, Academy-aligned records, five beginner tutorial topics, CCC, Cell Model explanations, and all 14 structured curriculum modules.
- Added concrete completion records under `learning/academy/`, `learning/basic-exercises/`, `learning/ccc-playground/`, `learning/cell-model/`, and `learning/curriculum/`.
- Kept evidence claims bounded: repository completion does not invent external certificates, wallet signatures, or Testnet transaction hashes.

### Checkpointed AI-agent workflows

- Added `ckbuilder-agent-workflow-plan/v1` dependency-aware plans with evidence requirements, execution limits, approval gates, and recovery policy.
- Added deterministic post-run evidence/confidence evaluation with blockers and recovery actions.
- Added tamper-detectable, resumable `ckbuilder-agent-workflow-checkpoint/v1` checkpoints and a public verification API.
- Bound workflow plan, evaluation, and checkpoint hashes into signed agent job receipts.
- Added the **CKB Agent Workflow Orchestrator** multi-agent service with workflow planning, evidence verification, risk/approval review, and synthesis roles.
- Expanded the public Agent Services UI to show workflow plans, evidence control, checkpoints, and checkpoint verification.

### Release hardening and validation

- Restored sanitized `.env.example`, `.env.public.example`, `.env.issuer.example`, `.gitignore`, and `.dockerignore` release files and executable launcher permissions.
- Updated production UI/version regression expectations for v10.2.0.
- Full Node.js regression: **368 tests, 367 passed, 0 failed, 1 optional integration skipped**.
- `npm run ci:local`, `npm run learning:check`, `npm run test:v10.2`, and `npm run vercel:check` pass.
- Updated the Week 6 report to connect public Vercel deployment, 100% repository learning progress, and the checkpointed AgentOS workflow layer.

## 10.1.0 — 2026-08-19

### Expanded real-world workflows

- Expanded Mission Control from 7 to 15 CKB workflows with explicit ordered stages exposed in `/api/config` and rendered in the browser.
- Added Testnet Launch Gate, CCC Wallet Integration, xUDT Token Launch, Spore/DOB Creator Launch, RGB++ Integration Review, Credential Trust Audit, RPC Incident Response, and Fiber Liquidity/Routing Planner workflows.
- Added CKB Production Incident Team, Credential Trust Auditor, Wallet & Transaction Flow Reviewer, and Asset Launch Reviewer services to the Agent Service Hub.
- Added service workflow stages to the execution contract while preserving no-signing, no-broadcast, no-autonomous-spend boundaries.
- Added an incident-command synthesis path for the production incident multi-agent team.

### Production UI refresh

- Reworked the public interface into a restrained product-console style: flatter surfaces, smaller radii, reduced shadow/gradient use, denser information hierarchy, and grouped navigation.
- Replaced marketing-heavy/AI-first labels with task-oriented product language while preserving all existing workflow IDs, routes, and safety boundaries.
- Added direct navigation for Agent services, Workflows, Custom analysis, and Model access.
- Added browser metadata and a dedicated production-UI regression suite to prevent the old generated-marketing copy from returning.

### Verification

- Added 11 focused workflow/use-case regression tests, including mocked end-to-end CKB RPC, Fiber, CKB docs, HTTP configuration, signed receipt, and multi-agent incident flows.
- Full Node.js regression suite: 364 total, 363 passed, 0 failed, 1 optional CCC integration skipped in the validation environment.
- `npm run ci:local` and `npm run vercel:check` pass.
- Added Week 6 public-deployment evidence: Vercel Overview, Learning Hub, Credential Inspector screenshots, deployment incident note, deployment preflight output, and the Week 6 progress report.


## 10.0.1 — 2026-08-15

### Fixed

- Fixed Google Gemini 3 tool-using application runs that could fail upstream with HTTP 400 after a function call.
- Preserved Gemini model Parts, including opaque `thoughtSignature`, across stateless GenerateContent continuation requests.
- Added ID/name-matched Gemini `functionResponse` Parts and parallel-call response-cardinality handling.
- Updated direct Gemini request fields to current `systemInstruction`, `functionDeclarations`, `parametersJsonSchema`, `inlineData`, and `mimeType` JSON names.
- Removed CKBuilder's low generic `temperature` override from Gemini 3.x requests and defaulted new Gemini selections to stable `gemini-3.7-flash`.
- Provider failures now return sanitized upstream detail as HTTP 502 instead of being flattened into a local HTTP 400.
- Separated live-workspace `ci:runtime` from clean-release `ci:local`, preventing `.env`, `secrets/`, `node_modules/`, and runtime PID/state files from causing false failures after a successful local startup.

### Evidence and documentation

- Added seven Week 5 screenshots under `screenshots/week-05/`.
- Added `reports/week-05-report.md` and root compatibility pointer `week-05-report.md`.
- Updated README, v10 architecture notes, test status, report index, and submission checklist for v10.0.1.
- Added Gemini request-shape, thought-signature replay, function-response matching, and upstream-error redaction regression coverage.

## 10.0.0 — 2026-08-15

- Added persistent Ed25519 service identity and independently verifiable signed agent receipts.
- Migrated private agent jobs to SQLite/WAL with legacy JSON migration and signed-receipt reputation metrics.
- Bound untrusted MCP approval to exact tool arguments using a canonical SHA-256 approval fingerprint.
- Hardened remote MCP transport with 2026-07-28 `server/discover`, authorization support, redirect blocking, bounded responses, and private-network/DNS-rebinding defenses.
- Added observable `ckbuilder-agent-workflow/v1` DAG execution with parallel specialists and synthesis.
- Added unsigned CKB capacity-transfer intent construction plus deterministic preflight and optional read-only Cell discovery.
- Added read-only Fiber payment-status verification after external human-approved payment execution.
- Added official CKB Dev Skills live grounding.

## 9.0.0 — 2026-08-14

- Added private token-gated agent job persistence, service reputation, pre-execution service agreements, receipt verification, transaction preflight, runtime doctor, and portable evidence-pack export.

## 8.0.0 — 2026-08-14

- Added the CKB Agent Service Hub, launch-readiness multi-agent team, Fiber dry-run commerce planner, cryptographic job receipts, deterministic fulfillment evaluation, and NEAR AI BYOK provider.

## 7.0.0 — 2026-08-14

- Reframed the AI product as **CKB Mission Control** with seven concrete workflows instead of a blank-prompt-first experience.
- Added Fiber Node Operator Diagnostics with read-only node/peer/channel/payment/graph evidence and explicit live-configuration status.
- Added CKB Transaction Failure Lab and expanded read-only CKB RPC/Indexer tooling, including `dry_run_transaction`, Cell search, and capacity evidence without broadcast.
- Added CKB Script Debug & Test Lab backed by a secret-filtered, path-confined, read-only developer workspace plugin with no arbitrary shell execution.
- Added xUDT/Spore/RGB++ asset investigation, CKB contribution discovery, protocol/ecosystem research briefs, and CKB-native dApp architecture workflows.
- Added CKB Project Radar for current allowlisted GitHub issue/release/commit evidence and optional server-only `CKB_GITHUB_TOKEN`.
- Added application readiness metadata, expected deliverables, dedicated `POST /api/ai/application`, Mission Control cards/UI, and workflow evidence trails.
- Hardened MCP blocks to cover Fiber payment/channel mutation names in addition to signing/broadcast/secret operations.
- Added focused v7 application, plugin, HTTP, and UI regression coverage while preserving all v6 agent/plugin safety boundaries.

## 6.0.0 — 2026-08-14

- Upgraded optional BYOK AI from prompt routing to a bounded multi-step CKB tool-using agent runtime.
- Added native tool/function schemas and tool-call parsing for OpenAI-compatible providers, Anthropic, and Gemini.
- Added built-in official CKB docs, Nervos community, and read-only CKB JSON-RPC plugins.
- Added MCP Streamable HTTP support with current stateless requests, JSON/SSE responses, and legacy session fallback.
- Added the community CKB AI MCP integration, disabled by default behind explicit plugin selection and tool approval rules.
- Added data-only `plugins/community/*.json` manifests, a JSON Schema, example manifest, and `npm run plugins:check`.
- Added per-tool audit traces, hard step/call limits, untrusted tool-output isolation, and hard blocks for signing/broadcast/private-key style MCP tools.
- Added Agent Workbench plugin selection, step budget, one-run approval UI, and audit-trace rendering.
- Expanded v6 AI/plugin/runtime/HTTP/UI regression coverage while preserving deterministic CKB credential verification authority.

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

## 8.0.0 - 2026-08-14
- Added deterministic service agreement and fulfillment evaluation; receipts now bind both hashes.

- Added the CKB Agent Service Hub and automatic community-MCP service delegation surface.
- Added a three-specialist CKB Launch Readiness Team with release-chair synthesis.
- Added Fiber payment quote simulation; `send_payment` is reachable only through a wrapper that forces `dry_run=true` and returns a human-execution intent.
- Added cryptographic `ckbuilder-agent-job-receipt/v1` receipts and application-defined CKB anchor digest payloads.
- Added optional NEAR AI Cloud BYOK provider through its OpenAI-compatible API.
- Added v8 HTTP/UI surfaces and dedicated agent-commerce regression coverage.
- Retained hard blocks on signing, CKB broadcast, Fiber real payments, and channel mutation.

## 9.0.0 - 2026-08-14

- Added a private persistent agent-job ledger with per-job retrieval tokens and no public objective listing.
- Added evidence-derived service reputation statistics to Agent Service Hub cards.
- Added pre-execution, objective-bound service agreements and server-side tamper rejection before AI execution.
- Added independent receipt/agreement/fulfillment verification over HTTP and via `agent:receipt:verify` CLI.
- Added deterministic raw CKB transaction preflight with optional `dry_run_transaction`; signing and broadcast remain impossible from this layer.
- Added Agent Runtime Doctor to distinguish installed plugins from actually configured/runnable integrations without leaking secrets.
- Added tab-scoped private job reopen UX and portable agent evidence-pack export.
- Added dedicated v9 unit, HTTP, security, CLI and browser-contract regression coverage.
