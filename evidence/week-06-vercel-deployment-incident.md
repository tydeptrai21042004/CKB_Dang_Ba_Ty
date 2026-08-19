# Week 6 Vercel deployment incident note

**Date:** 19 August 2026  
**Deployment:** `ckb-dang-ba-ty.vercel.app`

## Observed failure

The first public invocation returned Vercel `500 INTERNAL_SERVER_ERROR` / `FUNCTION_INVOCATION_FAILED`.

The server log identified the startup exception as:

```text
AppError: ISSUER_LOCK_HASH must be 0x followed by exactly 64 hexadecimal characters.
code: ENV_LOCK_HASH_INVALID
```

The exception occurred during public-environment validation while importing `vercel-entry.js`, so even `/api/health` could not respond.

## Cause

`ISSUER_LOCK_HASH` had been configured with an invalid placeholder value. Because the variable existed, the adapter's default value was not used, and the normal environment validator rejected the malformed hash.

## Correction

The invalid environment value was removed or replaced with a syntactically valid `0x` + 64-hex-character value, followed by a Vercel redeployment.

The Week 6 screenshots were captured after the correction and show the public application loading successfully in Testnet / read-only mode.

## Boundary

This incident note proves the configuration failure and recovery path. It does not claim that a live Testnet credential-revocation contract has been deployed; Testnet chain inspection remains disabled until real deployment metadata is present.
