# CKBuilder AgentOS v10.0.1 — production deployment

## Services

CKBuilder is deliberately split into two processes:

- **Public Passport + verifier** (`npm run inspector:serve`, default `:4173`) — read-only for credential keys. It serves Passport lookup, public proof verification, evidence submission, QR/portable credential output, learning, and optional AI requests.
- **Issuer portal** (`npm run issuer:serve`, default `:4273`) — authenticated administration. This process loads issuer signing keys and is intentionally bound to loopback in the production Compose file.

Never expose the issuer port directly to the public Internet. Put it behind a VPN, zero-trust access proxy, or private administrative network.

## AI: bring your own key

No user AI key is required in `.env`. The BYOK catalog supports OpenAI, Google Gemini, Anthropic, Mistral, DeepSeek, OpenRouter, Groq, and NEAR AI Cloud. A user selects a provider/model and enters an API key in the UI. The browser keeps the key only in memory for the current tab. CKBuilder forwards it only for the requested AI action; it is not written to SQLite, the credential ledger, audit logs, agent-job records, or credential payloads. New Gemini selections default to `gemini-3.7-flash`.

AI can:

- summarize deterministic credential verification;
- triage submitted project/evidence references;
- explain missing evidence;
- answer curriculum questions;
- run bounded Mission Control/Advanced Agent workflows over declared read-only tools;
- build unsigned CKB transaction intents and explain deterministic preflight results;
- produce signed agent-service receipts and evidence packs;
- inspect configured read-only CKB/Fiber/workspace/community evidence.

AI cannot:

- approve a submission;
- access issuer or wallet private keys;
- sign credentials or CKB transactions;
- broadcast CKB transactions;
- execute a real Fiber payment or mutate a Fiber channel;
- change trusted issuers;
- mint/revoke by itself;
- override a cryptographic or CKB verification result.

## Storage

`PRODUCT_DB_PATH` is a SQLite WAL database used for users, profiles, submissions, submission timelines, issuance/revocation operations, webhook delivery history, and audit events. The cryptographic credential ledger remains compatible with the v2 implementation in `DATA_DIR`.

This zero-extra-service mode is appropriate for a **single application host**. For active-active multi-host deployment, replace the `product-db.js` adapter with PostgreSQL and use shared durable object storage for generated public artifacts.

## CKB lifecycle

Set `CHAIN_WRITE_MODE`:

- `disabled` — local product demo only; credentials are off-chain.
- `optional` — CKBuilder attempts CKB writes and fails issuance rather than creating a falsely successful credential if the chain write fails.
- `required` — recommended for Testnet/Mainnet production.

The issuer workflow is prepare → chain transaction → local persistence. A failed chain transaction does not mark the submission as issued.

## Network promotion

1. OffCKB Devnet.
2. CKB Testnet with the revocation Type Script deployed and the Testnet section present in the configured system/deployment JSON.
3. Mainnet only after the Testnet workflow and recovery procedures are exercised. `APP_NETWORK=mainnet` is supported by the network abstraction, but you must deploy the project contract on Mainnet and supply its deployment metadata.

For Mainnet, use a trusted private CKB RPC or an appropriately protected provider. Do not expose a node RPC directly to browsers.

## First start

```bash
cp .env.example .env
# edit .env; replace ADMIN_PASSWORD and SESSION_SECRET
npm ci
npm run issuer:init
npm run prod:check
npm run inspector:serve
```

In a second private terminal:

```bash
npm run issuer:serve
```

For Docker production, do **not** share one environment file between services. Use the split examples:

```bash
cp .env.public.example .env.public
cp .env.issuer.example .env.issuer
# configure public values in .env.public
# configure signing/admin/webhook secrets only in .env.issuer
docker compose -f docker-compose.production.yml up -d --build
```

The Compose stack first runs an idempotent `issuer-init` one-shot service. It creates/reuses the Ed25519 issuer keypair and writes the trusted-issuer registry into the shared data volume before the public service becomes eligible to start. The bootstrap mount is writable only for initialization; the long-running issuer service mounts `./secrets` read-only.

Public app: `http://localhost:4173`  
Issuer portal: `http://127.0.0.1:4273`

## QR codes

The `/api/qr?credentialId=...` endpoint uses the small `qrencode` system utility. The provided Docker image installs it. Portable credential JSON is available from `/api/certificate/:credentialId`.

## Operational minimum

Before external deployment:

- replace bootstrap admin password and session secret;
- use HTTPS at the reverse proxy;
- restrict issuer portal access;
- back up `DATA_DIR` and the SQLite database;
- back up issuer keys separately and encrypted;
- set `CHAIN_WRITE_MODE=required` for a CKB-backed production environment;
- configure a trusted RPC and monitor it;
- run `npm run prod:check` and `npm test`;
- test issue → verify → revoke → verify on Testnet.


## v4 public directory

Public discovery is disabled by default. Set `PUBLIC_DIRECTORY_ENABLED=1` only when searchable credential metadata is an intentional product requirement. Verification by exact credential ID and Passport lookup continue to work when the directory is disabled.

## v4 signed webhooks

Issuer-side integrations can receive signed HTTPS events with `WEBHOOK_URL` and `WEBHOOK_SECRET`. Private/local destinations are blocked to reduce SSRF risk. Treat webhook delivery as notification only; chain/credential state remains authoritative.

## v4 backup and observability

Use `GET /api/ready` for public service readiness, the private Operations/Webhooks tabs for operational diagnosis, and `npm run backup:export` for a restricted JSON export. Keep issuer signing keys backed up separately and encrypted.


## v5 HTML/document and attachment hardening

HTML and uploaded evidence are untrusted. Do not bypass the built-in sanitizer by mounting `DATA_DIR/product-attachments` into a public static web root. Raw evidence downloads are intentionally forced as attachments. Keep the shared data volume private to the CKBuilder services.

Recommended operational checks:

```bash
npm run attachments:audit
npm run backup:export:full -- /secure/private/ckbuilder-full-backup
```

The normal `backup:export` command contains attachment metadata but not raw evidence bytes. Use `backup:export:full` when disaster recovery must include uploaded evidence. Store full backups encrypted because they may contain private applicant documents.

PDF is accepted for deterministic SHA-256 comparison and private attachment storage, but the provider-neutral BYOK AI document extractor intentionally does not send PDF files to third-party AI APIs.

Printable HTML credentials are available from `/api/certificate/:credentialId/html`. They are convenience artifacts; verifiers should follow the embedded verification link for current revocation/chain state.


## Runtime CI and release audit

A live application tree is expected to contain local runtime state. Validate that state with:

```bash
npm run ci:runtime
```

A distributable release tree must not contain runtime `.env`, `secrets/`, `node_modules/`, PID files, or private state. Validate a clean release copy/archive with:

```bash
npm run ci:local
```

Do not weaken `scripts/audit-release.sh` to make a live workspace pass; run the correct CI mode for the artifact being validated.
