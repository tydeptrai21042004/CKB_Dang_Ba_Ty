# Test status — v5.0.0

Validated on 2026-08-08 in the v5 release workspace.

## Automated checks

| Check | Result |
|---|---:|
| JavaScript syntax | Passed |
| v5 dedicated HTML/document/storage/security tests | **32/32 passed** |
| Full Node.js regression suite | **215 total** |
| Passed | **214** |
| Failed | **0** |
| Skipped | **1 optional CCC dependency integration test** |
| Production configuration check | Passed; warnings only for intentionally absent test keys/qrencode |
| Attachment storage audit smoke test | Passed |
| Full private backup smoke test | Passed; manifest mode `0600` |

The skipped Node.js test is the existing optional CCC integration test. `@ckb-ccc/core` is not installed in this execution environment, so that integration path is skipped rather than falsely reported as passed.

The Rust contract test suite was not rerun because `cargo` and `rustc` are unavailable in this runtime. Historical Rust/CKB evidence remains in the repository and is not represented as a fresh v5 execution.

## v5 security coverage

The new suite tests hostile HTML removal, event-handler/attribute stripping, sandboxed preview, MIME mismatch rejection, SVG rejection, malformed JSON, printable credential escaping/CSP, attachment tracking-token authorization, raw HTML forced-download behavior, reviewer authentication, read-time SHA-256 integrity verification, missing/tampered/orphaned attachment audits, and BYOK AI key non-persistence.

## Commands

```bash
npm run test:v5
npm run syntax:check
npm test
npm run attachments:audit
npm run backup:export
npm run backup:export:full -- /secure/private/ckbuilder-full-backup
npm run prod:check
bash scripts/audit-release.sh
```
