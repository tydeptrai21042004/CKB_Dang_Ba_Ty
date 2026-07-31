# CKBuilder Learning Hub

This directory records learning separately from capstone implementation. A working feature or local simulation is technical evidence, but it does not automatically prove that an official course module or on-chain tutorial was completed.

## Current structure

| Track | What belongs here | Completion rule |
|---|---|---|
| `rustlings-solved/` | Corrected Rust source for the included foundation exercises | Every source passes deterministic checks and, when Rust is installed, compiles or tests successfully |
| `academy/` | One record per CKB Academy module | Dated note, personal explanation, result, repository application, and screenshot |
| `basic-exercises/` | Five official beginner tutorials | A real `completion.md` plus screenshots from Devnet/Testnet; templates do not count |
| `ccc-playground/` | CCC App, Playground, examples, and API study | Separate evidence file for each expected activity |
| `cell-model/` | Project-specific Cell Model understanding | Eight answers in the learner's own words plus one transaction diagram |
| `catalog.json` | Official tutorial and resource links shown in the UI | JSON schema and URL checks must pass |

## Runnable local practice

```bash
npm run exercises:run
npm run exercises:test
npm run exercises:evidence
```

The suite covers:

- CKB/Shannon conversion and transfer capacity conservation;
- UTF-8 to hexadecimal Cell-data round trips;
- unsigned 128-bit little-endian xUDT amount encoding;
- canonical DOB metadata and a local integrity checksum;
- hash-lock success and wrong-preimage rejection.

These are deterministic learning models, not real transactions.

## Validate learning materials

```bash
npm run learning:check
npm run learning:check:rust
```

## Screenshot evidence

Read `docs/SCREENSHOT_EVIDENCE_GUIDE.md`. Keep the exercise name, success result, and network context visible, but never capture private keys, seed phrases, passwords, tokens, `.env` values, or unrelated personal information.

## Accuracy rule

Do not create retrospective completion claims. Missing Academy, official tutorial, CCC, or Cell Model evidence remains visibly pending until its required completion file exists and contains real details.
