# 09. Molecule serialization and canonical data

**Category:** Contracts  
**Level:** Intermediate  
**Estimated study time:** 60 minutes

## Why this lesson matters

Understand deterministic binary schemas, canonical encoding, and why on-chain readers and writers must agree byte-for-byte.

## Learning outcomes

- Explain why deterministic serialization matters
- Differentiate fixed and dynamic structures conceptually
- Validate a payload before script logic consumes it

## Core mental model

This lesson is designed to be read together with the official references and the runnable repository exercises. Do not treat a successful local model as proof of an on-chain tutorial. Local exercises verify concepts deterministically; official completion requires real execution evidence.

### Explain it in your own words

Before moving on, write a short explanation that another beginner could understand. Include one concrete example from the CKBuilder credential project rather than copying documentation text.

## Guided lab

1. Run the community vector tests.
2. Decode a canonical credential Cell.
3. Mutate one byte and observe validation behavior.

### Commands

```bash
npm run community:check
npm run test:vectors
npm run learning:quiz -- molecule-serialization
```

## Checkpoints

- [ ] Inspect the repository 75-byte credential Cell format
- [ ] Explain canonical versus malformed encoding
- [ ] Decode one test vector and compare every field

## Evidence to retain

- A screenshot showing the exercise, tool, or source file name.
- A screenshot showing the successful result or the expected rejection.
- The exact command used, with secrets removed.
- A short dev-log paragraph explaining what changed in your understanding.

Use `EVIDENCE_TEMPLATE.md`, then create `completion.md` only after the work is genuinely complete.

## Knowledge check

Run:

```bash
npm run learning:quiz -- molecule-serialization
```

## Official references

- [Serialization and Molecule in CKB](https://docs.nervos.org/docs/serialization/serialization-molecule-in-ckb)
