# CCC API Notes

- Status: **complete**
- Recorded: **2026-08-19**

Consolidated API responsibilities and safety boundaries, including read-only queries, transaction construction, signer ownership, and network-aware error handling.

## Project connection

The CKBuilder transaction builder intentionally produces an unsigned intent and keeps wallet signing/broadcast outside the AI runtime. This is the operational boundary used throughout the project.
