# Start the complete project

From Ubuntu, Debian, WSL2, or macOS Terminal, open this repository directory and run:

```bash
bash run-full-project.sh
```

That single command checks the current environment, reuses compatible installed tools, installs only missing prerequisites, creates or reuses local issuer keys, selects a prefunded local OffCKB development account, builds and tests the contract, deploys it, uses one credential ID for the off-chain and on-chain `ACTIVE -> REVOKED` lifecycle, exports a verified public proof, and starts the Public Credential Inspector.

When the command reports success, open:

```text
http://127.0.0.1:4173
```

No browser wallet, wallet extension, seed phrase, testnet faucet, account import, or manual contract deployment is required.

## Check or control the project

```bash
bash run-full-project.sh --status
bash run-full-project.sh --fast
bash run-full-project.sh --restart
bash run-full-project.sh --stop
```

The first run requires internet access. On Linux/WSL, the operating system may ask once for the Linux `sudo` password if build packages are not already installed.

## Weekly reports and evidence

- [Week 1 report](reports/week-01-report.md)
- [Week 2 report](reports/week-02-report.md)
- [Week 2 run summary](evidence/week-02-run-summary.json)
- [Sanitized end-to-end log](evidence/automatic-end-to-end-run-2026-07-22-sanitized.log)


## Run the guided learning workspace

Open the Learning Hub at `http://127.0.0.1:4173/#learning`, or use the terminal tools:

```bash
npm run learning:check
npm run learning:quiz:list
npm run learning:quiz -- ckb-foundations
npm run learning:test
npm run exercises:run
npm run exercises:test
```

Start with `learning/STUDY_PLAN.md`. Every curriculum module under `learning/curriculum/` includes a lesson, a three-question quiz, checkpoints, a practical activity, and an evidence template.

To create a local machine-readable exercise record, run `npm run exercises:evidence`. Local quiz/exercise success does not count as official Devnet/Testnet completion; real screenshots and a filled `completion.md` are still required. See `docs/SCREENSHOT_EVIDENCE_GUIDE.md`.
