import crypto from "node:crypto";

function b64(value) { return Buffer.from(value).toString("base64url"); }
function unb64(value) { return Buffer.from(value, "base64url").toString("utf8"); }
function sign(input, secret) { return crypto.createHmac("sha256", secret).update(input).digest("base64url"); }

export function createSessionToken(user, secret, ttlSeconds = 8 * 60 * 60) {
  const payload = b64(JSON.stringify({ sub: user.id, email: user.email, role: user.role, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  return `${payload}.${sign(payload, secret)}`;
}
export function verifySessionToken(token, secret) {
  if (!token || !secret) return null;
  const [payload, mac] = String(token).split(".");
  if (!payload || !mac) return null;
  const expected = sign(payload, secret);
  const a = Buffer.from(mac); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const value = JSON.parse(unb64(payload));
    if (!value.exp || value.exp < Math.floor(Date.now() / 1000)) return null;
    return value;
  } catch { return null; }
}
export function parseCookies(header = "") {
  return Object.fromEntries(String(header).split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const i = part.indexOf("="); return i < 0 ? [part, ""] : [part.slice(0, i), decodeURIComponent(part.slice(i + 1))];
  }));
}
export function sessionCookie(token, secure = false) {
  return `ckbuilder_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure ? "; Secure" : ""}`;
}
export function clearSessionCookie(secure = false) {
  return `ckbuilder_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}
