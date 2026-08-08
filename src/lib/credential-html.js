import crypto from "node:crypto";
import { publicCredentialSummary } from "./passport-service.js";

function esc(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function safeUrl(value) { try { const u = new URL(String(value)); return new Set(["https:","http:"]).has(u.protocol) ? u.toString() : null; } catch { return null; } }
export function credentialHtml(record, publicBaseUrl = "") {
  const c = publicCredentialSummary(record);
  if (!c) return null;
  const base = safeUrl(String(publicBaseUrl || "").replace(/\/$/, ""));
  const verifyUrl = base ? `${base.replace(/\/$/, "")}/?credentialId=${encodeURIComponent(c.credentialId)}#inspector` : null;
  const keyFingerprint = crypto.createHash("sha256").update(String(record.issuerPublicKeyPem ?? "")).digest("hex");
  const status = c.status === "ACTIVE" ? "ACTIVE" : c.status;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(c.award.title)} · CKBuilder Credential</title>
<style>body{margin:0;background:#f4f6f8;color:#17212b;font:16px/1.5 system-ui,-apple-system,sans-serif}.sheet{max-width:900px;margin:32px auto;background:#fff;border:1px solid #dce2e8;border-radius:18px;padding:44px;box-shadow:0 12px 35px #0001}.brand{letter-spacing:.12em;font-weight:800}.badge{display:inline-block;padding:.35rem .65rem;border:1px solid #768390;border-radius:999px;font-weight:700}.hero{text-align:center;padding:46px 10px}.hero h1{font-size:clamp(2rem,5vw,3.8rem);line-height:1.05;margin:.3em 0}.hero p{font-size:1.15rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin:26px 0}.cell{border:1px solid #e1e6eb;border-radius:12px;padding:14px}.cell span{display:block;color:#65717d;font-size:.8rem;text-transform:uppercase;letter-spacing:.06em}.cell strong,.cell code{overflow-wrap:anywhere}.proof{margin-top:30px;border-top:1px solid #e1e6eb;padding-top:22px}.proof code{display:block;overflow-wrap:anywhere;font-size:.78rem}.verify{display:inline-block;margin-top:16px;padding:.75rem 1rem;border-radius:10px;background:#17212b;color:#fff;text-decoration:none}@media print{body{background:#fff}.sheet{box-shadow:none;border:0;margin:0;max-width:none}.verify{border:1px solid #17212b;background:#fff;color:#17212b}}</style></head>
<body><main class="sheet"><div class="brand">CKBUILDER PASSPORT</div><div class="hero"><span class="badge">${esc(status)}</span><h1>${esc(c.award.title)}</h1><p>${esc(c.credentialType)} · ${esc(c.award.field)}</p></div>
<div class="grid"><div class="cell"><span>Credential ID</span><strong>${esc(c.credentialId)}</strong></div><div class="cell"><span>Issuer</span><strong>${esc(c.issuer.name)}</strong></div><div class="cell"><span>Issued</span><strong>${esc(c.award.issuedAt)}</strong></div><div class="cell"><span>Recipient Lock Hash</span><code>${esc(c.subject.recipientLockHash)}</code></div></div>
<section class="proof"><h2>Verification evidence</h2><div class="cell"><span>Signed document SHA-256</span><code>${esc(c.document.hash)}</code></div><div class="cell"><span>Issuer public-key fingerprint (SHA-256)</span><code>${esc(keyFingerprint)}</code></div>${verifyUrl ? `<a class="verify" href="${esc(verifyUrl)}" rel="noopener noreferrer">Verify current status</a><p><code>${esc(verifyUrl)}</code></p>` : "<p>Use the CKBuilder verifier with the credential ID above to check current status.</p>"}</section>
</main></body></html>`;
}
