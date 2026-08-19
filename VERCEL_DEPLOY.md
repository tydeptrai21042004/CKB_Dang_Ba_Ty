# Vercel deployment — existing project structure

This deployment keeps the repository layout unchanged. Vercel is added as a public/read-only deployment target through the root files `vercel.json`, `vercel-entry.js`, `.vercelignore`, and `.env.vercel.example`.

## What runs on Vercel

Enabled:

- public CKBuilder web UI
- health/readiness/config APIs
- credential/passport/directory lookup from the bundled sanitized ledger
- document/cell/proof inspection
- Learning Hub
- BYOK AI and read-only CKB/community tools
- Agent Service execution and self-contained signed receipts

Intentionally disabled on Vercel local storage:

- evidence submission / attachment persistence
- issuer/admin portal
- issuer or wallet private keys
- persistent SQLite agent jobs / reputation history
- QR generation through the system `qrencode` executable

The existing local/Docker deployment keeps all of those capabilities unchanged.

## 1. Validate before pushing

Use Node 22 and run:

```bash
npm run vercel:check
npm test
```

`npm run vercel:check` boots the actual `vercel-entry.js` adapter locally, checks `/api/health`, `/api/ready`, `/api/config`, performs a credential inspection, checks the serverless capability flags, and verifies that the smoke test did not write into bundled `data/`.

## 2. Push the same repository to GitHub

No directory move is needed. The sanitized public files required by a fresh Git checkout are allowlisted in `.gitignore`:

```text
data/ledger.json
data/trusted-issuers.json
data/offckb-chain-state.json
deployment/scripts.json
deployment/system-scripts.json
```

Runtime databases, logs, secrets, uploaded evidence, and private agent identity remain ignored.

## 3. Import into Vercel

In Vercel:

1. **Add New → Project**
2. Import the Git repository.
3. **Framework Preset:** `Other`
4. **Root Directory:** repository root (`./`)
5. Leave **Build Command** and **Output Directory** unset.
6. Deploy.

The repository pins Node to `22.x` in `package.json`.

## 4. Environment variables

The first read-only Testnet deployment can boot using the safe defaults in `vercel-entry.js`. For the real public project, copy the public values from `.env.vercel.example` into **Vercel → Project → Settings → Environment Variables** and replace the issuer/RPC values with your own.

Recommended public values:

```env
APP_NETWORK=testnet
CKB_RPC_URL=https://YOUR-TRUSTED-CKB-RPC
REQUIRE_CKB_RPC=0
ISSUER_LOCK_HASH=0xYOUR_REAL_64_HEX_LOCK_HASH
PUBLIC_APP_NAME=CKBuilder Passport
PUBLIC_DIRECTORY_ENABLED=1
AI_ENABLED=1
AI_DEFAULT_PROVIDER=openai
AI_DEFAULT_MODEL=gpt-4.1-mini
CHAIN_INSPECTION_ENABLED=0
```

Do **not** put these issuer/admin secrets into the public Vercel project:

```text
CKB_ISSUER_PRIVATE_KEY
CKB_ISSUER_PRIVATE_KEY_FILE
ISSUER_PRIVATE_KEY_PATH
ADMIN_PASSWORD
SESSION_SECRET
WEBHOOK_SECRET
```

BYOK AI provider keys are supplied by the user in the browser session; the project does not require a shared server AI key for the public BYOK flow.

## 5. Live CKB verification

The repository currently contains `credential-revocation` contract deployment metadata for `devnet`. The `testnet` and `mainnet` entries in `deployment/scripts.json` are empty.

For that reason the Vercel adapter automatically sets `chainInspectionEnabled=false` for Testnet/Mainnet until matching contract metadata is present. This is deliberate: the UI can still perform signed off-chain credential verification without falsely claiming a live chain check ran.

After you deploy the credential-revocation contract to Testnet:

1. Put the real Testnet contract `codeHash`, `hashType`, and `cellDeps` into `deployment/scripts.json`.
2. Put the correct public issuer Lock Script hash into `ISSUER_LOCK_HASH`.
3. Set:

```env
CHAIN_INSPECTION_ENABLED=1
```

4. Redeploy and run `/api/ready` plus a real credential verification.

The adapter refuses to enable live chain inspection when matching deployment metadata is absent, even if the environment flag is accidentally set to `1`.

## 6. Verify the deployed URL

Check:

```text
https://YOUR-PROJECT.vercel.app/
https://YOUR-PROJECT.vercel.app/api/health
https://YOUR-PROJECT.vercel.app/api/ready
https://YOUR-PROJECT.vercel.app/api/config
```

Expected Vercel capability values in `/api/config`:

```json
{
  "submissionEnabled": false,
  "submissionAttachments": false,
  "qrEnabled": false,
  "agentJobStoreEnabled": false,
  "deploymentTarget": "vercel",
  "storageMode": "read-only"
}
```

`chainInspectionEnabled` is `false` until the selected network has real contract metadata.

## 7. Public-launch hardening

The application retains its own bounded in-memory request limiter, but serverless instances do not share that memory. For a widely advertised public deployment, configure Vercel Firewall/WAF rate limiting for expensive POST API paths, especially:

```text
/api/inspect
/api/document/inspect
/api/ai/*
/api/agent-commerce/*
```

Also use a trusted/dedicated CKB RPC before relying on live chain verification at production traffic levels.

## 8. Issuer remains private

Continue to run issuance, revocation, evidence review, attachments, and the admin portal through the existing local/Docker deployment. Do not expose the issuer private key through the Vercel public project.

That separation is intentional and is the safest deployment mode without migrating persistence to an external database/object store.
