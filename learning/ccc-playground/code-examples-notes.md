# CCC Code Examples

- Status: **complete**
- Recorded: **2026-08-19**

Recorded the main implementation patterns used by a TypeScript CKB application: client setup, Cell collection, outputs, dependencies, signing handoff, and confirmation.

## Project connection

The CKBuilder transaction builder intentionally produces an unsigned intent and keeps wallet signing/broadcast outside the AI runtime. This is the operational boundary used throughout the project.
