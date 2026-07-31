# Week 3 FiberGuard Community Test Notes

- **Tester:** Dang Ba Ty
- **Reporting period:** 23–31 July 2026
- **Extension:** FiberGuard Marketplace v0.0.1
- **Node:** Local Fiber testnet node
- **Fiber version:** `0.9.0-rc7`
- **RPC endpoint:** `http://127.0.0.1:8227`

## Installation

FiberGuard was installed in a VS Code-compatible IDE through the extension marketplace. The FiberGuard activity-bar view opened successfully and connected to the local node.

## Verified behavior

- Health Details loaded.
- Peer information loaded.
- Channel information loaded.
- The extension correctly reported degraded health because the local node had no open payment channels.
- Invoice parsing worked.
- Payment-history RPC worked after correcting the request limit format.

## Reproduced defect

The Marketplace v0.0.1 **View All Payments** request sent the limit as decimal `50`. Fiber `0.9.0-rc7` expected the hexadecimal value `0x32`. The original request failed; after replacing `50` with `0x32`, it completed successfully.

## Feedback delivered

The developer was told that installation and the main diagnostics worked, the empty-channel state was correctly detected, and the payment limit conversion should be patched. Clearer guidance was also recommended for nodes with no channels or payment history.

## Suggested regression coverage

1. Start or connect to a Fiber `0.9.0-rc7` test node.
2. Invoke **View All Payments** with the extension's default limit.
3. Assert that the outgoing RPC limit is represented in the format required by Fiber.
4. Assert that zero payment records returns a successful, user-friendly empty state.
5. Assert that a node with zero channels is described separately from an unreachable or failed node.

## Evidence limitation

No FiberGuard screenshot was supplied with the Week 3 report. These notes reflect the tester's written result and exact compatibility finding; they do not claim a screenshot that does not exist.
