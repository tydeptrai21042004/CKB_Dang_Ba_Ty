# 04. Lock Scripts, Type Scripts, and script groups

**Category:** Contracts  
**Level:** Beginner  
**Estimated study time:** 45 minutes

## Why this lesson matters

Separate ownership rules from state-transition rules and understand how scripts are grouped and executed.

## Learning outcomes

- Differentiate Lock and Type Scripts
- Explain code_hash, hash_type, and args
- Describe why matching scripts are evaluated as groups

## Core mental model

This lesson is designed to be read together with the official references and the runnable repository exercises. Do not treat a successful local model as proof of an on-chain tutorial. Local exercises verify concepts deterministically; official completion requires real execution evidence.

### Explain it in your own words

Before moving on, write a short explanation that another beginner could understand. Include one concrete example from the CKBuilder credential project rather than copying documentation text.

## Guided lab

1. Inspect the credential Type Script configuration in this repository.
2. Compare the issuer Lock Script with the revocation Type Script.
3. Record one rule enforced by each script.

### Commands

```bash
npm run offckb:verify
npm run learning:quiz -- locks-and-types
```

## Checkpoints

- [ ] Classify three example rules as lock or type logic
- [ ] Trace script code from a Cell dep
- [ ] Explain what a non-zero script exit code means

## Evidence to retain

- A screenshot showing the exercise, tool, or source file name.
- A screenshot showing the successful result or the expected rejection.
- The exact command used, with secrets removed.
- A short dev-log paragraph explaining what changed in your understanding.

Use `EVIDENCE_TEMPLATE.md`, then create `completion.md` only after the work is genuinely complete.

## Knowledge check

Run:

```bash
npm run learning:quiz -- locks-and-types
```

## Official references

- [Intro to Script](https://docs.nervos.org/docs/script/intro-to-script)
- [How CKB Works](https://docs.nervos.org/docs/getting-started/how-ckb-works)
