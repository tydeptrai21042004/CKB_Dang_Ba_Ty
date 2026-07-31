# 07. CCC basics and wallet connections

**Category:** DApps  
**Level:** Beginner  
**Estimated study time:** 50 minutes

## Why this lesson matters

Learn the beginner-friendly JavaScript/TypeScript path for connecting wallets and reading CKB state.

## Learning outcomes

- Explain signer, client, and network roles
- Connect a DApp without placing private keys in application code
- Read addresses and balances through CCC

## Core mental model

This lesson is designed to be read together with the official references and the runnable repository exercises. Do not treat a successful local model as proof of an on-chain tutorial. Local exercises verify concepts deterministically; official completion requires real execution evidence.

### Explain it in your own words

Before moving on, write a short explanation that another beginner could understand. Include one concrete example from the CKBuilder credential project rather than copying documentation text.

## Guided lab

1. Open the CCC App and identify network, signer, and address.
2. Run one read-only Playground example.
3. Create `learning/ccc-playground/explore-ccc-app.md` from the evidence template.

### Commands

```bash
npm run learning:quiz -- ccc-basics
npm run learning:check
```

## Checkpoints

- [ ] Explore the CCC App
- [ ] Run one Playground example
- [ ] Record which wallet and network were used without exposing secrets

## Evidence to retain

- A screenshot showing the exercise, tool, or source file name.
- A screenshot showing the successful result or the expected rejection.
- The exact command used, with secrets removed.
- A short dev-log paragraph explaining what changed in your understanding.

Use `EVIDENCE_TEMPLATE.md`, then create `completion.md` only after the work is genuinely complete.

## Knowledge check

Run:

```bash
npm run learning:quiz -- ccc-basics
```

## Official references

- [CCC JavaScript/TypeScript](https://docs.nervos.org/docs/sdk-and-devtool/ccc)
- [CCC App](https://app.ckbccc.com/)
- [CCC Playground](https://live.ckbccc.com/)
