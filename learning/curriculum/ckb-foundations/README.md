# 01. CKB fundamentals and the Cell Model

**Category:** Foundations  
**Level:** Beginner  
**Estimated study time:** 35 minutes

## Why this lesson matters

Build the mental model for live Cells, consumed Cells, capacity, data, and immutable state transitions.

## Learning outcomes

- Explain why a Cell is immutable after creation
- Distinguish live and consumed Cells
- Describe how a transaction updates state by consuming inputs and creating outputs

## Core mental model

This lesson is designed to be read together with the official references and the runnable repository exercises. Do not treat a successful local model as proof of an on-chain tutorial. Local exercises verify concepts deterministically; official completion requires real execution evidence.

### Explain it in your own words

Before moving on, write a short explanation that another beginner could understand. Include one concrete example from the CKBuilder credential project rather than copying documentation text.

## Guided lab

1. Run `npm run exercises:run`.
2. Inspect the transfer and Cell-data practice results.
3. Write a five-sentence Cell Model explanation in your dev log.

### Commands

```bash
npm run exercises:run
npm run learning:quiz -- ckb-foundations
```

## Checkpoints

- [ ] Draw one input Cell becoming receiver and change outputs
- [ ] Explain where transaction fees come from
- [ ] Identify lock, type, capacity, and data in a Cell

## Evidence to retain

- A screenshot showing the exercise, tool, or source file name.
- A screenshot showing the successful result or the expected rejection.
- The exact command used, with secrets removed.
- A short dev-log paragraph explaining what changed in your understanding.

Use `EVIDENCE_TEMPLATE.md`, then create `completion.md` only after the work is genuinely complete.

## Knowledge check

Run:

```bash
npm run learning:quiz -- ckb-foundations
```

## Official references

- [How CKB Works](https://docs.nervos.org/docs/getting-started/how-ckb-works)
