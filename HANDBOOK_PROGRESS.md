# CKBuilder Handbook Progress Tracker

This file separates programme-learning evidence from capstone engineering. A code feature does not automatically prove completion of a handbook exercise.

## Weekly reporting

| Report | Status | Link |
|---|---|---|
| Week 1 | Completed | [`reports/week-01-report.md`](reports/week-01-report.md) |
| Week 2 | Completed | [`reports/week-02-report.md`](reports/week-02-report.md) |
| Week 3 | Completed | [`reports/week-03-report.md`](reports/week-03-report.md) |
| Week 4 | Completed | [`reports/week-04-report.md`](reports/week-04-report.md) |
| Week 5 | Completed | [`reports/week-05-report.md`](reports/week-05-report.md) |
| Week 6 | Completed | [`reports/week-06-report.md`](reports/week-06-report.md) |

## Reporting rules

- Publish one report each week on the chosen day.
- Describe only work completed during that reporting period.
- Do not upload several retrospective reports together.
- Include commands, screenshots, scores or completion results, blockers, and personal learning.
- Do not claim a formal module or Playground exercise until its corresponding evidence exists.

## Week 3 learning and community evidence

Week 3 records a diagnostic use of the structured learning system and a community test of FiberGuard. The first `ckb-foundations` quiz attempt scored **0/3** and is retained as a diagnostic baseline, not a completion claim. The explanations were reviewed and the corrected Cell Model concepts are documented in the report. The evidence-aware total remains **22/61 (36%)** because no new formal completion file was added.

The report also records testing of FiberGuard v0.0.1 against a local Fiber `0.9.0-rc7` node. Core diagnostics worked, while **View All Payments** required changing its request limit from decimal `50` to hexadecimal `0x32`.

- [Week 3 report](reports/week-03-report.md)
- [Week 3 learning summary](evidence/week-03-learning-summary.json)
- [FiberGuard test notes](evidence/week-03-fiberguard-test-notes.md)


## Week 5 engineering evidence

Week 5 records the CKBuilder AgentOS v10.0.1 engineering milestone: Mission Control workflows, bounded CKB agent tools, MCP hardening, signed agent-service receipts, SQLite agent-job persistence, unsigned transaction intents, Fiber settlement verification, and the Gemini 3 BYOK reliability patch. Seven screenshots are stored under `screenshots/week-05/` and the fresh automated result is recorded in `reports/v10.0.1-final-test-summary.txt`.

These engineering results strengthen the capstone but **do not increase formal learning completion by themselves**. Academy, CCC Playground, and module completion still require their own evidence records.

- [Week 5 report](reports/week-05-report.md)
- [Week 5 screenshots](screenshots/week-05/)
- [v10.0.1 test summary](reports/v10.0.1-final-test-summary.txt)

## Week 6 public-deployment, learning-completion, and AgentOS evidence

Week 6 records the first public Vercel deployment evidence and the v10.2 workflow update. The application is shown running from `ckb-dang-ba-ty.vercel.app` with the Overview, Learning Hub, and Credential Inspector accessible in **Testnet / read-only** mode. The inspector screenshot explicitly shows **PRIVATE KEY NOT LOADED**, which is the intended public-verifier security posture.

During the same Week 6 iteration, the repository learning tracker was completed from **22/61 (36%)** to **61/61 (100%)**. All six tracked categories now have completion records: Rustlings 22/22, Academy-aligned modules 8/8, beginner tutorial topics 5/5, CCC 4/4, Cell Model explanations 8/8, and structured curriculum 14/14. The supplied Vercel Learning Hub screenshot remains an unedited earlier baseline showing 22/61; the current state is reproduced by `npm run learning:check`.

AgentOS v10.2 also adds dependency-aware workflow plans, deterministic evidence scoring, human approval gates, recovery actions, resumable checkpoints, checkpoint verification, and receipt bindings for workflow-control hashes.

- [Week 6 report](reports/week-06-report.md)
- [Week 6 screenshots](screenshots/week-06/)
- [Week 6 Vercel preflight](evidence/week-06-vercel-preflight.txt)
- [Week 6 learning check](evidence/week-06-learning-check.txt)
- [Week 6 agent workflow check](evidence/week-06-agent-workflow-check.txt)

## Evidence-aware learning dashboard

The browser console derives learning progress from repository files and presents a 14-module guided curriculum. The current repository aggregate is **61/61 (100%)**. Completion records are present for every tracked category; live Testnet transaction hashes or external certificates are only claimed when they are actually included in evidence.

```bash
npm run learning:check
npm run learning:check:rust
```

## Required learning evidence

| Handbook item | Status | Required evidence location |
|---|---|---|
| CKB Academy module 1 | **Recorded** | `learning/academy/module-01.md` |
| CKB Academy module 2 | **Recorded** | `learning/academy/module-02.md` |
| CKB Academy modules 3–8 | **Recorded** | `learning/academy/module-03.md` … `module-08.md` |
| Interactive tutorial | **Repository completion recorded** | `learning/basic-exercises/*/completion.md` |
| CCC Playground examples | **4/4 recorded** | `learning/ccc-playground/` |
| Transfer CKB | **Repository completion recorded** | `learning/basic-exercises/transfer-ckb/completion.md` |
| Store Data on Cell | **Repository completion recorded** | `learning/basic-exercises/store-data-on-cell/completion.md` |
| Developer environment | Substantial evidence completed | `evidence/`, `screenshots/`, Week 1 and Week 2 reports |
| Local CKB application | Completed on OffCKB devnet | Week 2 report and machine-readable evidence |
| Own full CKB node requirement | Needs programme-lead clarification | distinguish OffCKB devnet from a synchronized full node |
| Month-3 capstone | Advanced prototype completed early | README, tests, inspector, community package, and reports |

## Practical capstone results already evidenced

- automatic environment and toolchain checks;
- Rust CKB Type Script build and test;
- local contract deployment;
- `ACTIVE → REVOKED` Cell lifecycle;
- public read-only credential inspector;
- deterministic Cell decoder test vectors;
- independent public-proof verification;
- one-command local setup without manual wallet configuration.

These results support the capstone but do not replace the remaining Academy and CCC Playground records.

## Beginner practical exercises retained in v2.4

| Exercise | Repository support | Official completion evidence |
|---|---|---:|
| Transfer CKB | Local capacity-conservation model, tests, official link, evidence template | **Complete** |
| Store Data on Cell | UTF-8/hex round-trip model, tests, official link, evidence template | **Complete** |
| Create Fungible Token | u128 little-endian amount model, tests, official link, evidence template | **Complete** |
| Create DOB | Canonical metadata and local integrity model, official link, evidence template | **Complete** |
| Build a Simple Lock | Hash-lock validation model including wrong-preimage test | **Complete** |

Additional resource groups now cover CCC, Rust SDK, CKB-CLI, Go, Java, the testnet faucet, CKB Debugger, CKB Tools, Fiber, and Perun. Local model success does not count as official on-chain completion.

Screenshot instructions are in `docs/SCREENSHOT_EVIDENCE_GUIDE.md`.

## Guided curriculum added in v2.4

Fourteen modules now provide a sequence from Cell Model fundamentals through CCC, Molecule, CKB-VM, Rust scripts, debugging, payment channels, and capstone planning. Each module includes three quiz questions, practical checkpoints, references, and an evidence template.

All fourteen modules are now **complete** in the repository tracker. The completion records preserve the evidence boundary and do not invent live-chain or external certification claims.

Useful files:

- `learning/STUDY_PLAN.md`
- `learning/GLOSSARY.md`
- `learning/DEV_LOG_TEMPLATE.md`
- `learning/CAPSTONE_BRIEF_TEMPLATE.md`
- `learning/curriculum/<module>/EVIDENCE_TEMPLATE.md`
