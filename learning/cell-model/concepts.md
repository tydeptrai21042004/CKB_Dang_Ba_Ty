# Cell Model concepts used by CKBuilder

This guide explains the design implemented by the repository. It is reference material, not personal completion evidence.

## 1. Cells are consumed, not edited

A CKB transaction consumes existing input Cells and creates new output Cells. The credential state therefore changes by spending the `ACTIVE` Cell and creating a new `REVOKED` Cell rather than modifying bytes in place.

## 2. The Lock Script authorises spending

The issuer's Lock Script controls who may consume the credential Cell. A valid issuer witness is required before the state transition can be accepted.

## 3. The Type Script protects state rules

The credential Type Script checks the 75-byte data layout and the permitted lineage transition. It rejects malformed data, direct revoked-state creation, field mutation, destruction, and reactivation.

## 4. Group inputs and outputs define one lineage step

Creation has no matching group input and exactly one `ACTIVE` group output. Revocation has one `ACTIVE` group input and exactly one `REVOKED` group output.

## 5. Irreversibility is local to a lineage

Once a particular credential Cell becomes `REVOKED`, that lineage cannot return to `ACTIVE`. This does not by itself prevent another independent Cell from being created with the same credential hash.

## 6. Duplicate live records are conflicts

A public verifier should not choose arbitrarily between multiple matching live Cells. The inspector reports duplicates or malformed matches as a conflict instead of claiming validity.

## 7. Public verification needs reading, not signing

The verifier may need CKB RPC access to read live Cells, but it does not need the issuer's private key. Signatures are checked with public keys and state is read from the chain.

## 8. Off-chain and on-chain evidence must agree

The signed credential, document hash, revocation event, issuer identity, and live Cell state are checked independently and then compared. A mismatch is reported explicitly.

## Transaction diagram

```text
Creation
issuer-owned funding Cell
        |
        +--> credential Cell: ACTIVE

Revocation
credential Cell: ACTIVE + issuer authorisation
        |
        +--> credential Cell: REVOKED
```
