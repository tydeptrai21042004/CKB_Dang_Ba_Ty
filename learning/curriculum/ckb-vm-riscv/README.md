# 10. CKB-VM, RISC-V, syscalls, and cycles

**Category:** Contracts  
**Level:** Intermediate  
**Estimated study time:** 60 minutes

## Why this lesson matters

Learn how scripts execute in CKB-VM, load transaction data through syscalls, return exit codes, and consume cycles.

## Learning outcomes

- Describe the CKB-VM execution boundary
- Identify common data-loading syscall purposes
- Interpret cycles as execution cost rather than a token fee model

## Core mental model

This lesson is designed to be read together with the official references and the runnable repository exercises. Do not treat a successful local model as proof of an on-chain tutorial. Local exercises verify concepts deterministically; official completion requires real execution evidence.

### Explain it in your own words

Before moving on, write a short explanation that another beginner could understand. Include one concrete example from the CKBuilder credential project rather than copying documentation text.

## Guided lab

1. Run the Rust contract tests when the toolchain is available.
2. Inspect one syscall in the contract source.
3. Record the success and one intentional failure exit code.

### Commands

```bash
npm run test:rust
npm run learning:quiz -- ckb-vm-riscv
```

## Checkpoints

- [ ] Trace code loading from Cell deps
- [ ] Map script inputs to syscall reads
- [ ] Record cycles for one contract test

## Evidence to retain

- A screenshot showing the exercise, tool, or source file name.
- A screenshot showing the successful result or the expected rejection.
- The exact command used, with secrets removed.
- A short dev-log paragraph explaining what changed in your understanding.

Use `EVIDENCE_TEMPLATE.md`, then create `completion.md` only after the work is genuinely complete.

## Knowledge check

Run:

```bash
npm run learning:quiz -- ckb-vm-riscv
```

## Official references

- [How CKB Works](https://docs.nervos.org/docs/getting-started/how-ckb-works)
- [Rust Script Quick Start](https://docs.nervos.org/docs/script/rust/rust-quick-start)
