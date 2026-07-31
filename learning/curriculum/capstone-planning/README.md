# 14. Capstone design and evidence planning

**Category:** Project  
**Level:** Intermediate  
**Estimated study time:** 60 minutes

## Why this lesson matters

Turn the learning path into a small CKB application with explicit scope, threat boundaries, tests, and weekly evidence.

## Learning outcomes

- Write a one-page application brief
- Define on-chain and off-chain responsibilities
- Plan tests, screenshots, and weekly dev-log evidence before implementation

## Core mental model

This lesson is designed to be read together with the official references and the runnable repository exercises. Do not treat a successful local model as proof of an on-chain tutorial. Local exercises verify concepts deterministically; official completion requires real execution evidence.

### Explain it in your own words

Before moving on, write a short explanation that another beginner could understand. Include one concrete example from the CKBuilder credential project rather than copying documentation text.

## Guided lab

1. Complete `learning/CAPSTONE_BRIEF_TEMPLATE.md`.
2. Review the idea with the programme director or DevRel.
3. Add the next week plan to the dev log.

### Commands

```bash
npm run learning:check
npm run ci:local
npm run learning:quiz -- capstone-planning
```

## Checkpoints

- [ ] State the user problem and smallest useful flow
- [ ] List protocol invariants and non-goals
- [ ] Map every claimed feature to a test or screenshot

## Evidence to retain

- A screenshot showing the exercise, tool, or source file name.
- A screenshot showing the successful result or the expected rejection.
- The exact command used, with secrets removed.
- A short dev-log paragraph explaining what changed in your understanding.

Use `EVIDENCE_TEMPLATE.md`, then create `completion.md` only after the work is genuinely complete.

## Knowledge check

Run:

```bash
npm run learning:quiz -- capstone-planning
```

## Official references

- [Nervos CKB Documentation](https://docs.nervos.org/)
- [Official CKB developer documentation](https://docs.nervos.org/)
