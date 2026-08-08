import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import { createWebhookDelivery, updateWebhookDelivery } from "./product-db.js";

function isPrivateIp(address) {
  if (net.isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (net.isIP(address) === 6) {
    const value = address.toLowerCase();
    return value === "::1" || value === "::" || value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd");
  }
  return false;
}

export function validateWebhookUrl(value) {
  if (!value) return null;
  let url;
  try { url = new URL(value); } catch { throw new Error("WEBHOOK_URL must be a valid HTTPS URL."); }
  if (url.protocol !== "https:") throw new Error("WEBHOOK_URL must use HTTPS.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || isPrivateIp(host)) throw new Error("WEBHOOK_URL must not target localhost or a private IP address.");
  if (url.username || url.password) throw new Error("WEBHOOK_URL must not contain credentials.");
  return url;
}

export function signWebhook(secret, timestamp, body) {
  if (!secret || String(secret).length < 24) throw new Error("WEBHOOK_SECRET must contain at least 24 characters when webhooks are enabled.");
  return `sha256=${crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

async function assertPublicHost(url, lookup = dns.lookup) {
  const result = await lookup(url.hostname, { all: true, verbatim: true });
  const addresses = Array.isArray(result) ? result : [result];
  if (!addresses.length || addresses.some((entry) => isPrivateIp(entry.address))) throw new Error("Webhook hostname resolves to a private or unavailable address.");
}

export async function deliverWebhook({ db, url: rawUrl, secret, eventType, payload, fetchImpl = fetch, lookup = dns.lookup, timeoutMs = 8000 }) {
  if (!rawUrl) return { skipped: true };
  const url = validateWebhookUrl(rawUrl);
  await assertPublicHost(url, lookup);
  const envelope = { schema: "ckbuilder-webhook/v1", event: eventType, sentAt: new Date().toISOString(), data: payload };
  const body = JSON.stringify(envelope);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signWebhook(secret, timestamp, body);
  const delivery = db ? createWebhookDelivery(db, eventType, url.toString(), envelope) : null;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        "user-agent": "CKBuilder-Webhook/1.0",
        "x-ckbuilder-event": eventType,
        "x-ckbuilder-timestamp": timestamp,
        "x-ckbuilder-signature": signature,
        "x-ckbuilder-delivery": delivery?.id ?? crypto.randomUUID()
      },
      body,
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) throw Object.assign(new Error(`Webhook returned HTTP ${response.status}.`), { httpStatus: response.status });
    if (delivery) updateWebhookDelivery(db, delivery.id, "DELIVERED", response.status, null);
    return { skipped: false, delivered: true, status: response.status, deliveryId: delivery?.id ?? null };
  } catch (error) {
    if (delivery) updateWebhookDelivery(db, delivery.id, "FAILED", error.httpStatus ?? null, String(error.message).slice(0, 1000));
    return { skipped: false, delivered: false, status: error.httpStatus ?? null, deliveryId: delivery?.id ?? null, error: String(error.message) };
  }
}
