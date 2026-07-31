# 11. Rust smart-contract development

**Category:** Contracts  
**Level:** Intermediate  
**Estimated study time:** 80 minutes

## Why this lesson matters

Structure a no-std Rust CKB script, validate arguments and Cell state, and keep error codes deterministic.

## Learning outcomes

- Navigate a basic Rust script project
- Design explicit validation branches and error codes
- Write unit and integration tests for valid and invalid transitions

## Core mental model

This lesson is designed to be read together with the official references and the runnable repository exercises. Do not treat a successful local model as proof of an on-chain tutorial. Local exercises verify concepts deterministically; official completion requires real execution evidence.

### Explain it in your own words

Before moving on, write a short explanation that another beginner could understand. Include one concrete example from the CKBuilder credential project rather than copying documentation text.

## Guided lab

1. Read the digital-credentials contract.
2. Run `make test` through the package command.
3. Document one invariant and the test that proves it.

### Commands

```bash
npm run test:rust
npm run offckb:lifecycle
npm run learning:quiz -- rust-script-development
```

## Checkpoints

- [ ] Explain the project entry point
- [ ] Trace ACTIVE to REVOKED validation
- [ ] Add one negative test without weakening the protocol

## Evidence to retain

- A screenshot showing the exercise, tool, or source file name.
- A screenshot showing the successful result or the expected rejection.
- The exact command used, with secrets removed.
- A short dev-log paragraph explaining what changed in your understanding.

Use `EVIDENCE_TEMPLATE.md`, then create `completion.md` only after the work is genuinely complete.

## Knowledge check

Run:

```bash
npm run learning:quiz -- rust-script-development
```

## Official references

- [Rust Script Quick Start](https://docs.nervos.org/docs/script/rust/rust-quick-start)
- [Rust SDK](https://docs.nervos.org/docs/sdk-and-devtool/rust)
