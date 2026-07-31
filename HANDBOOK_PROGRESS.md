# CKBuilder Handbook Progress Tracker

This file separates programme-learning evidence from capstone engineering. A code feature does not automatically prove completion of a handbook exercise.

## Weekly reporting

| Report | Status | Link |
|---|---|---|
| Week 1 | Completed | [`reports/week-01-report.md`](reports/week-01-report.md) |
| Week 2 | Completed | [`reports/week-02-report.md`](reports/week-02-report.md) |
| Week 3 | Completed | [`reports/week-03-report.md`](reports/week-03-report.md) |

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

## v2.4 evidence-aware learning dashboard

The browser console derives learning progress from repository evidence and now presents a 14-module guided curriculum. The included Rustlings subset is recorded as **22/22 corrected**, while curriculum, Academy, CCC Playground, tutorial, and learner-authored records remain pending unless their evidence files exist. The current honest aggregate is **22/61 (36%)**.

```bash
npm run learning:check
npm run learning:check:rust
```

## Required learning evidence

| Handbook item | Status | Required evidence location |
|---|---|---|
| CKB Academy module 1 | Not recorded | `learning/academy/module-01.md` plus screenshot |
| CKB Academy module 2 | Not recorded | `learning/academy/module-02.md` plus screenshot |
| CKB Academy modules 3–8 | Not recorded | one file and evidence set per module |
| Interactive tutorial | Not recorded | command, result, and screenshot |
| CCC Playground examples | Not recorded as separate exercises | `learning/ccc-playground/` |
| Transfer CKB | Not recorded as a handbook exercise | transaction/result screenshot |
| Store Data on Cell | Demonstrated inside the capstone, but not recorded separately | Cell data and retrieval evidence |
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
| Transfer CKB | Local capacity-conservation model, tests, official link, evidence template | Pending |
| Store Data on Cell | UTF-8/hex round-trip model, tests, official link, evidence template | Pending |
| Create Fungible Token | u128 little-endian amount model, tests, official link, evidence template | Pending |
| Create DOB | Canonical metadata and local integrity model, official link, evidence template | Pending |
| Build a Simple Lock | Hash-lock validation model including wrong-preimage test | Pending |

Additional resource groups now cover CCC, Rust SDK, CKB-CLI, Go, Java, the testnet faucet, CKB Debugger, CKB Tools, Fiber, and Perun. Local model success does not count as official on-chain completion.

Screenshot instructions are in `docs/SCREENSHOT_EVIDENCE_GUIDE.md`.

## Guided curriculum added in v2.4

Fourteen modules now provide a sequence from Cell Model fundamentals through CCC, Molecule, CKB-VM, Rust scripts, debugging, payment channels, and capstone planning. Each module includes three quiz questions, practical checkpoints, references, and an evidence template.

A module is shown as **available**, **planned**, or **complete** based on prerequisites and real completion records. Merely reading a lesson or passing a local quiz does not automatically claim programme completion.

Useful files:

- `learning/STUDY_PLAN.md`
- `learning/GLOSSARY.md`
- `learning/DEV_LOG_TEMPLATE.md`
- `learning/CAPSTONE_BRIEF_TEMPLATE.md`
- `learning/curriculum/<module>/EVIDENCE_TEMPLATE.md`
