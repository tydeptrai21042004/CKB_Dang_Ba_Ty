# Cell Model Answers — Completed

- Status: **complete**
- Recorded: **2026-08-19**

## Answer 1. Why is an output Cell consumed rather than modified in place?

A live Cell is immutable state. Updating application state means consuming the old Cell as an input and creating a new output Cell, so history is represented by transaction lineage rather than in-place mutation.

## Answer 2. Which input authorises credential creation or revocation?

The issuer-controlled input and its valid Lock Script witness establish spending authority. The verifier can check the resulting public data without holding the issuer signing key.

## Answer 3. What does the Lock Script protect in this project?

The Lock Script protects spending authority: it determines who may consume the credential Cell or funding Cell used by the credential lifecycle.

## Answer 4. What invariant does the Type Script protect?

The Type Script protects the credential data layout and permitted state transition, including valid creation, ACTIVE to REVOKED progression, field consistency, and rejection of malformed or forbidden transitions.

## Answer 5. Why does ACTIVE → REVOKED require one group input and one group output?

One matching ACTIVE group input and one matching REVOKED group output express a single lineage transition, making the state change explicit and preventing ambiguous mutation or destruction.

## Answer 6. Why is per-lineage irreversibility not the same as global uniqueness?

A specific credential lineage cannot return from REVOKED to ACTIVE, but another independent Cell could still be created with the same credential hash unless a separate uniqueness rule prevents it.

## Answer 7. Why should a public verifier need RPC access but no signer?

Verification is read-only: RPC is used to observe live Cell state, while signatures are verified with public keys. No private key is needed to inspect authenticity or revocation state.

## Answer 8. What does a duplicate live Cell mean, and why should the inspector return a conflict?

Multiple matching live Cells create ambiguous state. The verifier should report the conflict rather than selecting one record and falsely presenting a single authoritative state.

## Transaction diagram

```text
ACTIVE credential Cell + issuer authorization
        |
        +--> consume ACTIVE
        +--> create REVOKED credential Cell
```
