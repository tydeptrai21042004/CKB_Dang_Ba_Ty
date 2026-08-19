# CKBuilder Passport — Pre-public Security and Deployment Review

Review date: 2026-08-19

## Verdict

The original uploaded ZIP should not be deployed unchanged. The core credential, issuer/public separation, tamper/revocation checks, attachment protections, tool boundaries, and admin authorization tests are strong, but the upload was missing release dotfiles and had several Internet-exposure hardening gaps.

This hardened copy fixes the high-confidence issues that can be corrected without redesigning the product. The full Node test suite passes: 348 tests total, 347 passed, 0 failed, 1 optional CCC integration skipped in this review environment because npm registry access failed while reinstalling dependencies. The project release audit passes after dependencies are removed from the release tree.

## Changes made

1. Restored `.gitignore`, `.dockerignore`, `.env.example`, `.env.public.example`, and `.env.issuer.example`.
2. Restored executable permission on launch/stop shell scripts.
3. Bound the public Docker backend to `127.0.0.1:4173` instead of all host interfaces; it is intended to sit behind a reverse proxy.
4. Added explicit `TRUST_PROXY` handling. `X-Forwarded-For` and `X-Forwarded-Proto` are ignored unless proxy trust is enabled.
5. Bounded in-memory rate-limit maps so unbounded unique addresses cannot grow them forever.
6. Added rate limiting to `/api/learning`, `/api/config`, `/api/inspect`, `/api/decode-cell`, and `/api/verify-proof`.
7. Hardened the CKB workspace tool against symbolic-link escape and real-path escape.
8. Added validation for `TRUST_PROXY` and `CHAIN_WRITE_MODE` configuration values.
9. Strengthened `npm run prod:check` to reject example admin identity, zero lock hash, placeholder RPC/base URLs, non-HTTPS external base URLs, and a missing CKB signing key when chain writing is enabled.
10. Added `Caddyfile.example` for an HTTPS reverse-proxy deployment.
11. Added regression tests for spoofed `X-Forwarded-For` and workspace symlink escape.

## Remaining production risks

### High priority before a large anonymous launch

- Anonymous evidence submissions and attachment uploads can consume SQLite/disk space. Current per-request and per-submission limits help, but there is no CAPTCHA/email verification, account quota, global disk quota, or automatic retention/purge policy.
- The issuer portal has password authentication but no built-in MFA. Keep port 4273 private; use an SSH tunnel or an external Zero-Trust/MFA layer rather than publishing it.
- Admin sessions are signed stateless cookies. Logout clears the browser cookie, but a stolen token cannot be centrally revoked before expiry.

### Medium priority / scale

- `node:sqlite` uses synchronous database APIs. This is acceptable for a single-host community beta, but heavy public traffic should move persistence-heavy paths to an async database/worker architecture (for example PostgreSQL) and add centralized rate limiting.
- Public and issuer services share the same data volume. Monitor disk usage and back it up; an exhausted volume can affect both services.
- Keep `CKB_AGENT_WORKSPACE` empty on the public service unless all readable source in that workspace is intentionally exposable to anonymous users. Keep `CKB_GITHUB_TOKEN` empty unless a least-privilege server token is genuinely needed.

## Recommended production topology

Internet -> DNS -> Caddy :443 -> 127.0.0.1:4173 -> public container

Private administrator -> SSH tunnel -> 127.0.0.1:4273 -> issuer container

Issuer/public containers -> trusted CKB RPC

Never expose 4173 or 4273 directly in the host firewall. Only 80/443 (and restricted SSH) should be Internet-facing.

## Deployment sequence

1. Start on CKB Testnet, not Mainnet.
2. Point the domain DNS record to the VPS.
3. Install Docker Engine + Docker Compose and Caddy on the VPS.
4. Copy this release tree to the server.
5. Create `.env.public` and `.env.issuer` from the examples.
6. Replace all placeholders. In particular, set the real issuer lock hash, trusted CKB RPC, public domain, strong admin password, random session secret, and the CKB issuer signing-key path. Keep `PUBLIC_DIRECTORY_ENABLED=0` unless public search is intentional.
7. Put the CKB issuer private key in `./secrets/` with restrictive filesystem permissions. Never put it in `.env`, Git, the browser, or the public container environment.
8. Run the production preflight explicitly before startup:
   `docker compose -f docker-compose.production.yml run --rm issuer-init npm run prod:check`
9. Start the stack:
   `docker compose -f docker-compose.production.yml up -d --build`
10. Check backend readiness from the VPS:
   `curl -fsS http://127.0.0.1:4173/api/ready`
11. Copy `Caddyfile.example` to your Caddy configuration, replace `verify.example.com`, and reload Caddy.
12. Confirm the public site only through `https://your-domain`.
13. Access the issuer portal privately with:
   `ssh -L 4273:127.0.0.1:4273 user@your-server`
   then browse to `http://127.0.0.1:4273` on the administrator machine.
14. On Testnet, run a complete issue -> public verify -> revoke -> public verify flow before considering Mainnet.
15. Back up the application data volume and issuer keys separately; encrypt key backups.

## Final launch gate

Do not call the service production-ready until all of the following are true:

- `npm test` has zero failures on the deployment/staging machine.
- `npm run prod:check` has zero blocking errors.
- `scripts/audit-release.sh` passes on the release tree.
- HTTPS works on the real domain.
- Host firewall does not expose 4173 or 4273.
- Public container has no issuer/admin/signing secrets.
- Issuer portal is reachable only through a private administrative path.
- Testnet issue/verify/revoke/verify succeeds.
- Backup and restore procedures have been tested.
- Anonymous submission abuse controls are acceptable for the expected audience/traffic.
