# 05. Addresses, hashes, and identity binding

**Category:** Foundations  
**Level:** Beginner  
**Estimated study time:** 40 minutes

## Why this lesson matters

Connect human-readable addresses to lock scripts, and distinguish transaction, script, code, and content hashes.

## Learning outcomes

- Explain that an address encodes a lock script representation
- Distinguish transaction hash from script hash
- Use hashes without confusing them with encryption

## Core mental model

This lesson is designed to be read together with the official references and the runnable repository exercises. Do not treat a successful local model as proof of an on-chain tutorial. Local exercises verify concepts deterministically; official completion requires real execution evidence.

### Explain it in your own words

Before moving on, write a short explanation that another beginner could understand. Include one concrete example from the CKBuilder credential project rather than copying documentation text.

## Guided lab

1. Inspect the configured issuer lock hash.
2. Compare a credential ID hash with a transaction hash.
3. Document where each hash is used in verification.

### Commands

```bash
npm run credential:inspect -- --help
npm run learning:quiz -- addresses-and-hashes
```

## Checkpoints

- [ ] Decode the role of script args in an address
- [ ] Label four different hash purposes
- [ ] Explain why a hash does not reveal a private key

## Evidence to retain

- A screenshot showing the exercise, tool, or source file name.
- A screenshot showing the successful result or the expected rejection.
- The exact command used, with secrets removed.
- A short dev-log paragraph explaining what changed in your understanding.

Use `EVIDENCE_TEMPLATE.md`, then create `completion.md` only after the work is genuinely complete.

## Knowledge check

Run:

```bash
npm run learning:quiz -- addresses-and-hashes
```

## Official references

- [How CKB Works](https://docs.nervos.org/docs/getting-started/how-ckb-works)
- [CKB Tools](https://ckb.tools/)
