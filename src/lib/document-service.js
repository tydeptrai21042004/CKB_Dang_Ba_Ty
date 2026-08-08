import crypto from "node:crypto";
import path from "node:path";
import { AppError } from "./errors.js";

const MIME_BY_EXT = new Map([
  [".html", "text/html"], [".htm", "text/html"], [".txt", "text/plain"], [".md", "text/markdown"],
  [".markdown", "text/markdown"], [".json", "application/json"], [".pdf", "application/pdf"],
  [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".webp", "image/webp"]
]);
const TEXT_MIMES = new Set(["text/html", "text/plain", "text/markdown", "application/json"]);
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);
const SUPPORTED_MIMES = new Set([...TEXT_MIMES, ...IMAGE_MIMES, "application/pdf"]);
const HTML_ALLOWED = new Set(["article","section","main","header","footer","div","p","h1","h2","h3","h4","h5","h6","ul","ol","li","dl","dt","dd","blockquote","pre","code","strong","b","em","i","u","s","small","mark","span","br","hr","table","thead","tbody","tfoot","tr","th","td","caption"]);

export function decodeCanonicalBase64(value) {
  if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0) throw new AppError("DOCUMENT_BASE64_INVALID", "Document must use canonical base64 without whitespace.");
  let padding = 0;
  if (value.endsWith("==")) padding = 2; else if (value.endsWith("=")) padding = 1;
  const contentLength = value.length - padding;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i); const inPadding = i >= contentLength;
    if (inPadding) { if (code !== 61) throw new AppError("DOCUMENT_BASE64_INVALID", "Document must use canonical base64 without whitespace."); continue; }
    const valid = (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 43 || code === 47;
    if (!valid) throw new AppError("DOCUMENT_BASE64_INVALID", "Document must use canonical base64 without whitespace.");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) throw new AppError("DOCUMENT_BASE64_INVALID", "Document must use canonical base64 without whitespace.");
  return bytes;
}
function cleanFileName(value) {
  const base = path.basename(String(value ?? "document").replaceAll("\0", "")).trim() || "document";
  return base.replace(/[\r\n]/g, "_").slice(0, 180);
}
function decodeUtf8(bytes) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new AppError("DOCUMENT_TEXT_ENCODING_INVALID", "Text/HTML documents must be valid UTF-8."); }
}
function decodeEntities(text) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, code) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
    }
    return named[code.toLowerCase()] ?? m;
  });
}
export function htmlVisibleText(html) {
  let value = String(html ?? "");
  value = value.replace(/<!--[\s\S]*?-->/g, " ");
  value = value.replace(/<(script|style|noscript|template|iframe|object|embed|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  value = value.replace(/<(br|hr)\b[^>]*>/gi, "\n");
  value = value.replace(/<\/(p|div|section|article|main|header|footer|h[1-6]|li|tr|blockquote|pre|table)\s*>/gi, "\n");
  value = value.replace(/<[^>]+>/g, " ");
  value = decodeEntities(value);
  return value.replace(/\r/g, "").replace(/[\t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
export function sanitizeHtmlFragment(html) {
  let value = String(html ?? "");
  value = value.replace(/<!--[\s\S]*?-->/g, "");
  value = value.replace(/<(script|style|noscript|template|iframe|object|embed|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  value = value.replace(/<!doctype[^>]*>/gi, "").replace(/<\/?(?:html|head|body|meta|link|base|form|input|button|textarea|select|option|img|video|audio|source|canvas)\b[^>]*>/gi, "");
  return value.replace(/<\s*(\/?)\s*([A-Za-z0-9:-]+)(?:\s[^>]*)?>/g, (whole, slash, rawTag) => {
    const tag = rawTag.toLowerCase();
    if (!HTML_ALLOWED.has(tag)) return "";
    if (slash && new Set(["br","hr"]).has(tag)) return "";
    return `<${slash ? "/" : ""}${tag}>`;
  });
}
export function safeHtmlPreviewDocument(html, title = "HTML document preview") {
  const safe = sanitizeHtmlFragment(html);
  const safeTitle = String(title).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><style>body{font:16px/1.55 system-ui,sans-serif;max-width:900px;margin:32px auto;padding:0 24px;color:#202124}pre,code{white-space:pre-wrap;overflow-wrap:anywhere}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #bbb;padding:.35rem}.notice{padding:.65rem .8rem;border:1px solid #bbb;border-radius:8px;margin-bottom:1rem;font-size:.9rem}</style></head><body><div class="notice">Safe preview: scripts, embedded objects, forms, images, links, styles, and attributes were removed.</div>${safe}</body></html>`;
}
function inferMime(fileName, claimedMime, bytes) {
  const ext = path.extname(fileName).toLowerCase();
  const byExt = MIME_BY_EXT.get(ext);
  let mime = String(claimedMime ?? "").toLowerCase().split(";")[0].trim();
  if (!mime || mime === "application/octet-stream") mime = byExt ?? "application/octet-stream";
  if (byExt && mime !== byExt && !(byExt === "image/jpeg" && mime === "image/jpg")) throw new AppError("DOCUMENT_TYPE_MISMATCH", "File extension and MIME type do not agree.");
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") mime = "application/pdf";
  else if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime = "image/png";
  else if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) mime = "image/jpeg";
  else if (bytes.length >= 12 && bytes.subarray(0,4).toString("ascii") === "RIFF" && bytes.subarray(8,12).toString("ascii") === "WEBP") mime = "image/webp";
  return mime;
}
export function decodeDocumentInput(input, options = {}) {
  const maxBytes = Number(options.maxBytes ?? 5 * 1024 * 1024);
  const bytes = decodeCanonicalBase64(input?.documentBase64);
  if (!bytes.length) throw new AppError("DOCUMENT_INVALID", "Document is empty.");
  if (bytes.length > maxBytes) throw new AppError("DOCUMENT_TOO_LARGE", `Document must be ${maxBytes} bytes or smaller.`);
  const fileName = cleanFileName(input?.fileName);
  const mimeType = inferMime(fileName, input?.mimeType, bytes);
  if (!SUPPORTED_MIMES.has(mimeType)) throw new AppError("DOCUMENT_TYPE_UNSUPPORTED", "Supported documents: HTML, TXT, Markdown, JSON, PDF, PNG, JPEG, and WebP.");
  return { bytes, fileName, mimeType };
}
export function inspectDocumentInput(input, options = {}) {
  const { bytes, fileName, mimeType } = decodeDocumentInput(input, options);
  const result = {
    fileName, mimeType, byteLength: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    textExtracted: false, visibleTextLength: 0, textExcerpt: null, safeHtml: null
  };
  if (TEXT_MIMES.has(mimeType)) {
    const raw = decodeUtf8(bytes);
    let text = mimeType === "text/html" ? htmlVisibleText(raw) : raw;
    if (mimeType === "application/json") {
      try { text = JSON.stringify(JSON.parse(raw), null, 2); }
      catch { throw new AppError("DOCUMENT_JSON_INVALID", "JSON document is not valid JSON."); }
    }
    text = text.trim();
    result.textExtracted = true; result.visibleTextLength = text.length; result.textExcerpt = text.slice(0, Number(options.maxTextChars ?? 12000));
    if (mimeType === "text/html") result.safeHtml = safeHtmlPreviewDocument(raw, fileName);
  }
  return result;
}
export function documentTextForAi(input, options = {}) {
  const { bytes, fileName, mimeType } = decodeDocumentInput(input, { maxBytes: options.maxBytes ?? 5 * 1024 * 1024 });
  if (!TEXT_MIMES.has(mimeType)) return { bytes, fileName, mimeType, text: null };
  const raw = decodeUtf8(bytes);
  let text = mimeType === "text/html" ? htmlVisibleText(raw) : raw;
  if (mimeType === "application/json") {
    try { text = JSON.stringify(JSON.parse(raw), null, 2); } catch { throw new AppError("DOCUMENT_JSON_INVALID", "JSON document is not valid JSON."); }
  }
  return { bytes, fileName, mimeType, text: text.trim().slice(0, Number(options.maxTextChars ?? 30000)) };
}
export function supportedDocumentTypes() {
  return [...SUPPORTED_MIMES];
}
