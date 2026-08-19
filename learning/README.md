# CKBuilder Learning Hub

This directory tracks the repository learning path separately from capstone implementation. The current CKBuilder repository state is **61/61 tracked learning items (100%)**.

## Completion scope

The tracker records completion of the learning material and evidence records stored in this repository. It does **not** invent external certification, wallet signatures, or Testnet transaction hashes. When a live Devnet/Testnet transaction is not present, the corresponding record states that it was completed through the deterministic CKBuilder practice model.

| Track | Completion | Evidence location |
|---|---:|---|
| Rustlings foundations | **22/22** | `rustlings-solved/` |
| CKB Academy-aligned modules | **8/8** | `academy/module-01.md` … `module-08.md` |
| Official beginner tutorial topics | **5/5** | `basic-exercises/*/completion.md` |
| CCC learning path | **4/4** | `ccc-playground/*.md` |
| Cell Model explanations | **8/8** | `cell-model/answers.md` |
| Structured CKB curriculum | **14/14** | `curriculum/*/completion.md` |
| **Total** | **61/61 (100%)** | `npm run learning:check` |

## Runnable validation

```bash
npm run learning:check
npm run learning:test
npm run exercises:run
npm run test:v10.2
```

The deterministic practice suite covers CKB/Shannon conversion, transfer capacity conservation, UTF-8 Cell data, xUDT amount encoding, DOB/Spore metadata integrity, and hash-lock success/failure behavior.

## Evidence integrity rule

Completion files must contain meaningful repository evidence and must not use placeholder dates or fabricated transaction hashes. Live-chain evidence is only claimed when it is actually present. The public Learning Hub derives its percentage from these files, so the browser UI and CLI check remain consistent.
