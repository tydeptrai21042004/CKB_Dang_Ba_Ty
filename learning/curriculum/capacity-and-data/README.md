# 02. Capacity, data, and occupied bytes

**Category:** Foundations  
**Level:** Beginner  
**Estimated study time:** 35 minutes

## Why this lesson matters

Understand how CKBytes represent both value and storage capacity, and how Cell data affects required capacity.

## Learning outcomes

- Convert between CKB and shannons
- Explain occupied capacity at a practical level
- Encode and decode UTF-8 data stored in a Cell

## Core mental model

This lesson is designed to be read together with the official references and the runnable repository exercises. Do not treat a successful local model as proof of an on-chain tutorial. Local exercises verify concepts deterministically; official completion requires real execution evidence.

### Explain it in your own words

Before moving on, write a short explanation that another beginner could understand. Include one concrete example from the CKBuilder credential project rather than copying documentation text.

## Guided lab

1. Run the local Store Data on Cell model.
2. Change the sample message to include Vietnamese text.
3. Record the UTF-8 byte length and hexadecimal payload.

### Commands

```bash
npm run exercises:run
npm run learning:quiz -- capacity-and-data
```

## Checkpoints

- [ ] Calculate shannons for several CKB values
- [ ] Round-trip a Unicode message through hexadecimal
- [ ] Explain why extra data increases occupied capacity

## Evidence to retain

- A screenshot showing the exercise, tool, or source file name.
- A screenshot showing the successful result or the expected rejection.
- The exact command used, with secrets removed.
- A short dev-log paragraph explaining what changed in your understanding.

Use `EVIDENCE_TEMPLATE.md`, then create `completion.md` only after the work is genuinely complete.

## Knowledge check

Run:

```bash
npm run learning:quiz -- capacity-and-data
```

## Official references

- [Store Data on Cell](https://docs.nervos.org/docs/dapp/store-data-on-cell)
