# Screenshot Evidence Guide

CKBuilder reporting requires contemporaneous evidence. Capture screenshots while you perform each tutorial, not days later.

## Recommended evidence set per tutorial

1. **Setup:** terminal or app showing the exercise is running on Devnet/Testnet.
2. **Success:** transaction hash, committed status, build success, or script execution result.
3. **Verification:** changed balance, decoded Cell data, issued token, created DOB, or successful unlock.
4. **Negative test when relevant:** for Simple Lock, also show a wrong preimage being rejected.

## Windows 10/11

1. Press `Win + Shift + S`.
2. Choose **Rectangular Snip**.
3. Select only the terminal/app area needed as evidence.
4. Open the notification preview, redact secrets, and save as PNG.
5. Use names such as `transfer-ckb-01-setup.png` and place them in `screenshots/learning/`.

A full-screen alternative is `Win + PrtScn`, but cropped evidence is safer because it avoids exposing unrelated tabs and notifications.

## macOS

Press `Shift + Command + 4`, select the relevant area, and save the resulting PNG under `screenshots/learning/`.

## Linux

Use the desktop screenshot utility or `gnome-screenshot -a`. Capture only the relevant area.

## What must be visible

- Exercise name, command, or app page.
- Success output and transaction hash when available.
- Network context: Devnet or Testnet.
- Enough terminal lines to understand what happened.

## What must never be visible

- Private keys from `offckb accounts`.
- Seed phrases, wallet recovery data, passwords, API tokens, or `.env` values.
- Personal emails, chat messages, browser tabs, account names, or notifications.

When showing `offckb accounts`, crop the screenshot to the address and public lock information. Never include the `privkey` line.

## Add evidence to the dev log

```markdown
## Transfer CKB

Completed on 2026-07-31 using OffCKB Devnet.

![Devnet running](../screenshots/learning/transfer-ckb-01-setup.png)
![Committed transaction](../screenshots/learning/transfer-ckb-02-success.png)
![Receiver balance changed](../screenshots/learning/transfer-ckb-03-verification.png)

**What I learned:** A transfer consumes input Cells and creates new output Cells while preserving capacity except for the transaction fee.
```

After documenting a tutorial, copy its `EVIDENCE_TEMPLATE.md` to `completion.md`, fill it in, and run:

```bash
npm run learning:check
```
