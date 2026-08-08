import { spawnSync } from "node:child_process";
import { AppError } from "./errors.js";

export function qrSvg(value) {
  const text = String(value ?? "");
  if (!text || text.length > 2048) throw new AppError("QR_INPUT_INVALID", "QR input must contain 1-2048 characters.");
  const result = spawnSync("qrencode", ["-t", "SVG", "-o", "-", "-m", "2", "-s", "5", text], { encoding: "utf8", timeout: 5000, maxBuffer: 512 * 1024 });
  if (result.error?.code === "ENOENT") throw new AppError("QR_ENCODER_UNAVAILABLE", "QR generation requires the qrencode utility on this deployment.");
  if (result.status !== 0 || !result.stdout?.includes("<svg")) throw new AppError("QR_GENERATION_FAILED", "Could not generate QR code.");
  return result.stdout;
}
