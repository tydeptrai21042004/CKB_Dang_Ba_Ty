# 03. Transaction anatomy and conservation

**Category:** Transactions  
**Level:** Beginner  
**Estimated study time:** 45 minutes

## Why this lesson matters

Read inputs, outputs, dependencies, witnesses, fees, and transaction status as one coherent state transition.

## Learning outcomes

- Identify every major transaction component
- Check capacity conservation and fee calculation
- Explain pending, proposed, committed, and rejected states

## Core mental model

This lesson is designed to be read together with the official references and the runnable repository exercises. Do not treat a successful local model as proof of an on-chain tutorial. Local exercises verify concepts deterministically; official completion requires real execution evidence.

### Explain it in your own words

Before moving on, write a short explanation that another beginner could understand. Include one concrete example from the CKBuilder credential project rather than copying documentation text.

## Guided lab

1. Use the local transfer model to inspect sender, receiver, change, and fee.
2. Create one valid and one insufficient-capacity example.
3. Write the transaction lifecycle in your own words.

### Commands

```bash
npm run exercises:run
npm run learning:quiz -- transaction-anatomy
```

## Checkpoints

- [ ] Annotate a transaction JSON document
- [ ] Verify total input capacity equals outputs plus fee
- [ ] Explain why a returned transaction hash is not final confirmation

## Evidence to retain

- A screenshot showing the exercise, tool, or source file name.
- A screenshot showing the successful result or the expected rejection.
- The exact command used, with secrets removed.
- A short dev-log paragraph explaining what changed in your understanding.

Use `EVIDENCE_TEMPLATE.md`, then create `completion.md` only after the work is genuinely complete.

## Knowledge check

Run:

```bash
npm run learning:quiz -- transaction-anatomy
```

## Official references

- [CKB RPCs](https://docs.nervos.org/docs/getting-started/rpcs)
- [Transfer CKB](https://docs.nervos.org/docs/dapp/transfer-ckb)
