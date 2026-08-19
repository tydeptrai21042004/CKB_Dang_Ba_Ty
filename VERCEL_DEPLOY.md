# Deploy the existing project to Vercel

This deployment keeps the original project structure unchanged. Vercel uses only:

- `vercel.json` — routes the existing app through one Node.js Function.
- `vercel-entry.js` — a thin adapter around `src/lib/inspector-http.js`.
- `.vercelignore` — prevents secrets/local runtime files from being uploaded.

## One-click Git deployment

1. Push this project to GitHub.
2. In Vercel choose **Add New → Project** and import the repository.
3. Keep **Framework Preset = Other** and **Root Directory = repository root**.
4. Do not set a custom Build Command or Output Directory.
5. Deploy.

The default deployment uses CKB Testnet and the public read-only project data. For a real public deployment, set these Vercel Environment Variables:

```env
APP_NETWORK=testnet
CKB_RPC_URL=https://YOUR-TRUSTED-CKB-RPC
ISSUER_LOCK_HASH=0xYOUR_REAL_64_HEX_LOCK_HASH
PUBLIC_DIRECTORY_ENABLED=1
AI_ENABLED=1
```

Optional after the first deployment:

```env
PUBLIC_BASE_URL=https://your-project.vercel.app
```

Do **not** put issuer/admin secrets in Vercel:

```text
CKB_ISSUER_PRIVATE_KEY
CKB_ISSUER_PRIVATE_KEY_FILE
ISSUER_PRIVATE_KEY_PATH
ADMIN_PASSWORD
SESSION_SECRET
```

The Vercel deployment is intentionally the public/read-only side. Issuance, revocation, uploads, and persistent submissions should continue to use the existing private/local or Docker issuer service unless you later migrate persistence to an external database/object store.

## Verify after deployment

Open:

- `/`
- `/api/health`
- `/api/ready`
- `/api/config`

A healthy deployment should return HTTP 200 for the first three when the public ledger files are present.

## CLI deployment

If you use the Vercel CLI:

```bash
vercel
vercel --prod
```

No project restructuring is required.
