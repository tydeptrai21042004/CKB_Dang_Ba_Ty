# 08. Building and signing transactions with CCC

**Category:** DApps  
**Level:** Intermediate  
**Estimated study time:** 65 minutes

## Why this lesson matters

Move from read-only calls to transaction construction, completion, signing, sending, and confirmation.

## Learning outcomes

- Separate transaction construction from signing
- Explain automatic input and fee completion
- Track a sent transaction until commitment

## Core mental model

This lesson is designed to be read together with the official references and the runnable repository exercises. Do not treat a successful local model as proof of an on-chain tutorial. Local exercises verify concepts deterministically; official completion requires real execution evidence.

### Explain it in your own words

Before moving on, write a short explanation that another beginner could understand. Include one concrete example from the CKBuilder credential project rather than copying documentation text.

## Guided lab

1. Complete the Transfer CKB official tutorial.
2. Record sender, receiver, amount, fee, and transaction hash with secrets hidden.
3. Create the tutorial `completion.md` only after real on-chain success.

### Commands

```bash
npm run exercises:run
npm run learning:quiz -- ccc-transactions
```

## Checkpoints

- [ ] Build a transfer transaction
- [ ] Review outputs before signing
- [ ] Verify commitment independently after sending

## Evidence to retain

- A screenshot showing the exercise, tool, or source file name.
- A screenshot showing the successful result or the expected rejection.
- The exact command used, with secrets removed.
- A short dev-log paragraph explaining what changed in your understanding.

Use `EVIDENCE_TEMPLATE.md`, then create `completion.md` only after the work is genuinely complete.

## Knowledge check

Run:

```bash
npm run learning:quiz -- ccc-transactions
```

## Official references

- [CCC Guide](https://docs.nervos.org/docs/sdk-and-devtool/ccc)
- [Transfer CKB](https://docs.nervos.org/docs/dapp/transfer-ckb)
