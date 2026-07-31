# 06. RPC, indexer queries, and transaction status

**Category:** Tooling  
**Level:** Beginner  
**Estimated study time:** 50 minutes

## Why this lesson matters

Use JSON-RPC safely to query chain state, live Cells, transactions, and indexer results.

## Learning outcomes

- Construct a JSON-RPC 2.0 request
- Choose between direct transaction and indexer queries
- Avoid exposing a local node RPC to untrusted networks

## Core mental model

This lesson is designed to be read together with the official references and the runnable repository exercises. Do not treat a successful local model as proof of an on-chain tutorial. Local exercises verify concepts deterministically; official completion requires real execution evidence.

### Explain it in your own words

Before moving on, write a short explanation that another beginner could understand. Include one concrete example from the CKBuilder credential project rather than copying documentation text.

## Guided lab

1. Start OffCKB and confirm the configured endpoint.
2. Call one read-only RPC method.
3. Save the request and redacted response in the dev log.

### Commands

```bash
npm run project:start
npm run inspector:health
npm run learning:quiz -- rpc-and-indexer
```

## Checkpoints

- [ ] Query the tip block number
- [ ] Query a known transaction status
- [ ] Explain when indexer search is more appropriate than direct lookup

## Evidence to retain

- A screenshot showing the exercise, tool, or source file name.
- A screenshot showing the successful result or the expected rejection.
- The exact command used, with secrets removed.
- A short dev-log paragraph explaining what changed in your understanding.

Use `EVIDENCE_TEMPLATE.md`, then create `completion.md` only after the work is genuinely complete.

## Knowledge check

Run:

```bash
npm run learning:quiz -- rpc-and-indexer
```

## Official references

- [CKB RPCs](https://docs.nervos.org/docs/getting-started/rpcs)
- [CKB-CLI](https://github.com/nervosnetwork/ckb-cli)
