# Security notes

## Public Inspector boundary

The Public Credential Inspector is read-only. Its environment loader returns only public configuration and does not return either issuer private-key path. Public operations include credential verification, RPC Cell lookup, raw Cell-data decoding, and exported-proof verification.

The HTTP service adds:

- same-origin content security policy;
- frame denial and MIME sniffing protection;
- strict JSON content type;
- request and decoded-document limits;
- strict base64 validation;
- static path-traversal rejection;
- temporary document files created with owner-only permissions and removed after inspection;
- generic public error messages rather than local filesystem details.

## Contract control

Type Script arguments identify the issuer Lock Script hash. Creation and update require issuer authorisation, and the protected group input/output Cells must remain under that Lock Script.

## Secret handling

Never commit:

- `.env`;
- `secrets/`;
- issuer Ed25519 private keys;
- OffCKB, testnet, or mainnet signing keys;
- seed phrases or wallet exports;
- real student identifiers or identity salts.

The deterministic first OffCKB development key appears only as a known local test fixture. It is public and must never receive real funds.

## Public proof limitations

The proof digest detects later modification of the exported proof. It is not itself a blockchain signature and does not replace verification of issuer signatures, document hashes, or live RPC state.

## Protocol limitation

The contract prevents reactivation and lock reassignment within one registry Cell lineage. It still does not enforce global uniqueness against creating an independent new `ACTIVE` Cell with the same credential hash. The inspector therefore treats multiple live matches as a conflict.

## Reporting a vulnerability

Do not open a public issue containing real keys, private credentials, or exploitable deployment secrets. Share a minimal synthetic reproduction through the programme's official private channel first.

## v3 service boundary and optional AI

CKBuilder Passport v3 separates the public verifier from the issuer portal. The public process does not load issuer private keys. The issuer portal loads signing material and must be kept private behind authenticated administrative access.

AI is optional and bring-your-own-key. API keys entered in the browser are forwarded only for the requested AI call and are not stored in CKBuilder persistence. AI output is advisory: it cannot approve a credential, sign a record, send a CKB transaction, revoke a credential, change the trusted issuer registry, or override deterministic cryptographic/chain verification.

Uploaded certificate images sent to AI must be treated as hostile prompt-injection content. The AI prompts explicitly treat visible document/evidence text as data, not instructions. The AI process has no signer capability, limiting the impact of malicious document text.

The production Compose file binds the issuer portal to `127.0.0.1` by default. Use HTTPS for the public service and a VPN/zero-trust/private network for issuer access.

## v5 untrusted HTML and evidence-file boundary

Uploaded HTML is hostile input. CKBuilder never serves a raw HTML attachment inline. Reviewer raw access uses `application/octet-stream`, `Content-Disposition: attachment`, and `X-Content-Type-Options: nosniff`. Browser previews are generated from a strict sanitizer and rendered inside a sandboxed iframe. Active/embedded blocks, SVG/MathML, forms, links, images, styles, metadata, and all attributes are removed from HTML previews.

Attachment records store SHA-256 and byte length. Every reviewer read recomputes both and fails closed if the stored file changed. Use `npm run attachments:audit` to detect missing, tampered, or orphaned files. Full backups can contain private evidence and must be encrypted and access-controlled.

HTML/TXT/Markdown/JSON supplied to optional AI is converted to bounded untrusted text. Embedded instructions in a document are data, not authority. AI still cannot approve, sign, issue, revoke, modify issuer trust, or override deterministic verification.


## v10 AgentOS and tool authority boundary

The AI runtime is deliberately not a wallet or unrestricted shell. It can read declared evidence, build unsigned transaction intents, request bounded plugin operations, and produce signed service receipts. It cannot receive issuer/wallet private keys, sign or broadcast CKB transactions, execute real Fiber payments, mutate Fiber channels, or use community MCP tools whose names/permissions match hard-blocked signing/payment/secret operations.

Untrusted community MCP approvals are bound to both the tool name and a canonical SHA-256 hash of the requested arguments. A tool-name approval cannot silently authorize a different amount, destination, or payload. Remote MCP endpoints are subject to scheme policy, direct/private-address blocking, DNS resolution checks, redirect denial, timeouts, and bounded response sizes.

Agent-service receipts use a persistent Ed25519 service identity in protected runtime storage. A receipt hash proves content consistency; the signature separately proves which CKBuilder service identity issued the receipt. Do not copy the service private identity into public reports, client-side JavaScript, or portable evidence packs.

## v10.0.1 Gemini BYOK boundary

Gemini 3 stateless function-calling responses may contain opaque `thoughtSignature` metadata. CKBuilder preserves that provider-generated metadata only as protocol state needed for the next Gemini request; it is not interpreted as application authority and it is never treated as a private wallet/signing secret. Function results remain untrusted data and continue through the same plugin safety boundary.

User-supplied Gemini/API keys remain browser-session-only from CKBuilder's perspective. Upstream provider error details are length-bounded and redacted before they are returned to the browser. Never add raw request headers, API keys, or complete provider error dumps to logs or reports.

## Runtime state versus release artifacts

A live local workspace may legitimately contain `.env`, `secrets/`, `node_modules/`, SQLite databases, logs, and project-owned PID/state files. These are runtime assets and must stay out of distributable release archives. Use `npm run ci:runtime` for the live tree and `npm run ci:local` only for a clean release copy/archive; do not weaken the release audit to accommodate runtime state.
