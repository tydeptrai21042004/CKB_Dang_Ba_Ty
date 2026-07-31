# Test status — v2.4.0

Validated on 2026-07-31 in the release workspace and again from a clean packaged extraction.

## Automated checks

| Check | Result |
|---|---:|
| JavaScript syntax | Passed |
| Local beginner exercise models | 5/5 passed |
| Structured curriculum modules | 14 validated |
| Quiz banks | 14 files / 42 questions validated |
| Node.js tests | 126 total |
| Passed | 125 |
| Failed | 0 |
| Skipped | 1 optional CCC dependency integration test |
| Learning evidence check | 22/61 honestly recorded (36%) |
| Rustlings deterministic source check | 22/22 clean |
| Community conformance vectors | 6/6 verified |
| Release security audit | Passed |

The skipped CCC integration test activates when `@ckb-ccc/core` is installed. The release workspace's package mirror did not provide one transitive package, so the optional integration path was skipped rather than falsely reported as passed. All dependency-free application, API, UI, learning, quiz, credential, Cell decoder, proof-verification, and packaging tests passed.

## Commands

```bash
npm run syntax:check
npm run learning:check
npm run learning:quiz:list
npm run learning:test
npm run exercises:run
npm run community:check
npm test
bash scripts/audit-release.sh
```
