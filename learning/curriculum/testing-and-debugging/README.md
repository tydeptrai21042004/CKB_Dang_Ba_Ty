# 12. Testing, debugging, and cycle inspection

**Category:** Tooling  
**Level:** Intermediate  
**Estimated study time:** 70 minutes

## Why this lesson matters

Build a repeatable workflow across unit tests, mock transactions, local Devnet integration, debugger traces, and release checks.

## Learning outcomes

- Choose the right test layer for a defect
- Use CKB Debugger or mock transactions to inspect script failures
- Keep release claims tied to reproducible evidence

## Core mental model

This lesson is designed to be read together with the official references and the runnable repository exercises. Do not treat a successful local model as proof of an on-chain tutorial. Local exercises verify concepts deterministically; official completion requires real execution evidence.

### Explain it in your own words

Before moving on, write a short explanation that another beginner could understand. Include one concrete example from the CKBuilder credential project rather than copying documentation text.

## Guided lab

1. Run `npm run ci:local`.
2. Run one deliberately invalid proof or Cell vector.
3. Write a short defect report with reproduction, expected, and actual behavior.

### Commands

```bash
npm run ci:local
npm run inspector:health
npm run learning:quiz -- testing-and-debugging
```

## Checkpoints

- [ ] Run the full local CI suite
- [ ] Capture one expected contract failure
- [ ] Explain which tests do and do not require a running node

## Evidence to retain

- A screenshot showing the exercise, tool, or source file name.
- A screenshot showing the successful result or the expected rejection.
- The exact command used, with secrets removed.
- A short dev-log paragraph explaining what changed in your understanding.

Use `EVIDENCE_TEMPLATE.md`, then create `completion.md` only after the work is genuinely complete.

## Knowledge check

Run:

```bash
npm run learning:quiz -- testing-and-debugging
```

## Official references

- [CKB Standalone Debugger](https://github.com/nervosnetwork/ckb-standalone-debugger)
- [CKB-CLI](https://github.com/nervosnetwork/ckb-cli)
