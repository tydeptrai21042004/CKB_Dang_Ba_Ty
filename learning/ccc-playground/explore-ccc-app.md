# Explore CCC App

- Status: **complete**
- Recorded: **2026-08-19**

Reviewed the CCC application model: connector/account state, network selection, explicit signing boundary, and transaction lifecycle.

## Project connection

The CKBuilder transaction builder intentionally produces an unsigned intent and keeps wallet signing/broadcast outside the AI runtime. This is the operational boundary used throughout the project.
