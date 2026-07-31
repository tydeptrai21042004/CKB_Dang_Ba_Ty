# Basic CKB tutorial evidence

This directory tracks the five official beginner tutorials. Each subdirectory contains an evidence template. Completing the local deterministic practice suite does **not** mark an official tutorial complete.

## Local practice

```bash
npm run exercises:run
npm run exercises:test
npm run exercises:evidence
```

The generated JSON is written under `evidence/generated/` and is intentionally Git-ignored. It proves that the repository's local learning models execute; it is not on-chain proof.

## Real completion

For each official tutorial:

1. Follow the linked Nervos tutorial on Devnet or Testnet.
2. Save at least three screenshots with secrets hidden.
3. Copy `EVIDENCE_TEMPLATE.md` to `completion.md` in that tutorial directory.
4. Fill every field and link the screenshots from your weekly dev log.
5. Run `npm run learning:check`.
