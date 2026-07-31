# 13. Payment channels: Fiber and Perun

**Category:** Scaling  
**Level:** Intermediate  
**Estimated study time:** 55 minutes

## Why this lesson matters

Understand why repeated payments can move off-chain while CKB remains the verification and settlement layer.

## Learning outcomes

- Explain the channel lifecycle at a high level
- Differentiate off-chain updates from on-chain settlement
- Compare Fiber and Perun as separate CKB payment-channel approaches

## Core mental model

This lesson is designed to be read together with the official references and the runnable repository exercises. Do not treat a successful local model as proof of an on-chain tutorial. Local exercises verify concepts deterministically; official completion requires real execution evidence.

### Explain it in your own words

Before moving on, write a short explanation that another beginner could understand. Include one concrete example from the CKBuilder credential project rather than copying documentation text.

## Guided lab

1. Read the Fiber documentation overview.
2. Inspect one Fiber showcase project.
3. Inspect the Perun CKB backend or contracts and record one architectural difference.

### Commands

```bash
npm run learning:quiz -- payment-channels
```

## Checkpoints

- [ ] Describe open, update, and close phases
- [ ] Identify what must remain enforceable on-chain
- [ ] Review one open-source showcase or backend repository

## Evidence to retain

- A screenshot showing the exercise, tool, or source file name.
- A screenshot showing the successful result or the expected rejection.
- The exact command used, with secrets removed.
- A short dev-log paragraph explaining what changed in your understanding.

Use `EVIDENCE_TEMPLATE.md`, then create `completion.md` only after the work is genuinely complete.

## Knowledge check

Run:

```bash
npm run learning:quiz -- payment-channels
```

## Official references

- [Fiber Documentation](https://www.fiber.world/docs)
- [Fiber Showcase](https://www.fiber.world/showcase)
- [Perun CKB Backend](https://github.com/perun-network/perun-ckb-backend)
