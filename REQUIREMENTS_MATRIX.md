# CKBuilder task and contribution matrix

## Capstone implementation

| Expectation | Implementation | Evidence |
|---|---|---|
| Create an original CKB application | Academic credential issuance, integrity verification, and revocation | `src/`, `digital-credentials-workspace/` |
| Build on CKB | Custom Rust Type Script and CCC integration | contract source and OffCKB commands |
| Protect identity | Salted identity commitment; raw student ID and salt omitted from public record | credential privacy tests |
| Verify document integrity | SHA-256 certificate comparison | original/modified-document tests |
| Authenticate issuer | Ed25519 signature, trusted issuer registry, CKB Lock Script hash | signature and trust tests |
| Support revocation | Signed event plus 75-byte Cell state | Node.js and Rust implementation |
| Enforce per-lineage state | Only issuer-owned `ACTIVE → REVOKED` update is accepted | Rust policy and tests |
| Prevent ordinary duplicates | Issuer client refuses an existing live matching record | `createActiveRecord` guard |
| Detect protocol conflicts | Public inspector returns duplicate/malformed conflicts | inspector and record tests |
| Public verification | No-private-key CLI, web interface, and HTTP API | `credential:inspect`, `inspector:serve` |
| Export evidence | Canonical proof JSON and proof digest | proof export and verifier tests |
| Reproducible local workflow | Environment checks, build, test, deploy, lifecycle | scripts and sanitized evidence |

## Real community contribution

| Contribution | Reusable result | Verification |
|---|---|---|
| Open binary specification | `docs/CREDENTIAL_CELL_DATA_FORMAT.md` | field layout and canonical rules |
| Standalone decoder | `community/decoder/credential-cell-decoder.js` | no dependency, wallet, key, or RPC |
| Cross-language corpus | six deterministic valid/invalid vectors | `npm run test:vectors` |
| Decoder CLI/API | raw Cell data can be decoded independently | `cell:decode`, `/api/decode-cell` |
| Proof verifier CLI/API | detects proof modification and public-data leakage | `proof:verify`, `/api/verify-proof` |
| Contribution process | issue forms, PR template, contribution guide | `.github/`, `CONTRIBUTING.md` |
| Upstream preparation | safe transaction-visualizer decoder proposal | `docs/CKB_VIZ_DECODER_PROPOSAL.md` |

## Handbook compliance evidence

| Handbook requirement | Repository support | Current evidence status |
|---|---|---|
| Weekly contemporaneous GitHub report | Week 1 through Week 5 reports with linked evidence | completed through Week 5; external publication/feedback evidence remains separate |
| Course/module completion and scores | `learning/academy/` structure | not yet recorded |
| CCC Playground work | dedicated evidence directory | not yet recorded |
| Screenshots for practical work | screenshots and evidence folders | capstone evidence exists; course evidence still needed |
| Developer environment | automated local environment and OffCKB setup | substantially evidenced |
| Capstone application | working prototype and community package | implemented; public feedback still needed |

See `HANDBOOK_PROGRESS.md`. Do not mark missing course work as completed based only on capstone code.

## v2.2 learning and interface additions

| Addition | Implementation | Verification |
|---|---|---|
| Commercial-style browser console | Five responsive workspaces under `public/` | UI asset tests and browser preview screenshots |
| Honest learning progress | Evidence-derived `GET /api/learning` | learning overview and HTTP endpoint tests |
| Corrected included Rust exercises | 22 normalized source solutions | `npm run learning:check` and optional Rust compiler mode |
| Evidence templates | Academy and CCC Playground templates | missing work stays pending until actual evidence exists |

## Test inventory after v2.1 changes

- JavaScript: **74 passed, 0 failed, 0 skipped** in the recorded WSL run.
- Rust contract: **5 unit tests passed** and **18 `ckb-testtool` integration tests passed**.
- Community conformance: **6 deterministic vectors**, checked by the application decoder and the standalone community decoder.
- Automatic local lifecycle: hardened contract deployed, one `ACTIVE` Cell created, one `REVOKED` Cell confirmed, public proof exported, and inspector health verified.

See `reports/week-02-report.md` and `evidence/week-02-run-summary.json`.

## v5 document/evidence extension

| Requirement | v5 implementation |
|---|---|
| HTML credential input | Deterministic hash + visible-text extraction + sanitized preview |
| Browser-safe HTML rendering | Strict sanitizer + sandboxed iframe + restrictive CSP |
| Portable credential HTML | `/api/certificate/:credentialId/html`, escaped fields, no scripts |
| Text document support | TXT, Markdown, JSON extraction |
| PDF support | Deterministic hash/verification and private attachment storage |
| Private evidence attachments | Tracking-token add/list/remove; reviewer-only preview/download |
| Attachment integrity | SHA-256 + size verified on every read |
| Storage diagnostics | Missing/tampered/orphaned audit CLI + admin endpoint |
| Evidence disaster recovery | Full private backup command after successful integrity audit |
| Optional AI | BYOK text extraction for HTML/TXT/Markdown/JSON and vision for PNG/JPEG/WebP |


## v10.0.1 AgentOS extension

| Requirement | v10.0.1 implementation | Verification |
|---|---|---|
| Concrete CKB AI use cases | Mission Control application catalog plus Advanced Agent Workbench | v7/v10 HTTP/UI tests + Week 5 screenshots |
| Current CKB grounding | Official docs/LLM corpus + CKB Dev Skills tool | v10 docs-plugin regression |
| Read-only chain evidence | CKB JSON-RPC/Indexer lookup, Cell search, transaction lookup, dry-run | plugin/application tests |
| Safe transaction assistance | unsigned capacity-transfer intent + deterministic preflight | v10 transaction builder tests |
| Fiber integration | read-only diagnostics, forced dry-run quote, post-execution `get_payment` verification | v7/v8/v10 Fiber tests |
| Verifiable agent service | Ed25519 service identity + signed `ckbuilder-agent-job-receipt/v2` | v10 receipt tests |
| Persistent agent jobs | SQLite/WAL private job store with token-gated access | v10 persistence/reputation tests |
| Multi-agent observability | explicit `ckbuilder-agent-workflow/v1` DAG + workflow hash | v10 workflow tests |
| Community MCP safety | exact tool+argument approval, mutation hard blocks, SSRF/DNS/redirect defenses | v6/v7/v10 MCP tests |
| Gemini BYOK reliability | current GenerateContent field names, thought-signature replay, matching function responses, sanitized gateway errors | v10.0.1 AI/HTTP regressions |
| Runtime/release reproducibility | `ci:runtime` for live trees, `ci:local` for clean release audit | package/launcher regression + release audit |
| Week 5 evidence | seven screenshots + canonical Week 5 report | `screenshots/week-05/`, `reports/week-05-report.md` |

## Current v10.0.1 validation inventory

See `TEST_STATUS.md` and `reports/v10.0.1-final-test-summary.txt` for the fresh Week 5 counts. Historical v2/v5 counts above are retained only as contemporaneous milestones; they are not the current suite size.
