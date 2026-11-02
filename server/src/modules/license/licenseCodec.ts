import crypto from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  const result: string[] = [];
  let value = 0;
  let bits = 0;
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result.push(BASE32_ALPHABET[(value >>> (bits - 5)) & 31]);
      bits -= 5;
    }
  }
  if (bits > 0) {
    result.push(BASE32_ALPHABET[(value << (5 - bits)) & 31]);
  }
  return result.join("");
}

function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/=+$/g, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char.toUpperCase());
    if (index === -1) {
      throw new Error("激活码包含非法字符。");
    }
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export type LicenseEdition = "standard" | "premium";

export interface LicensePayload {
  edition: LicenseEdition;
  purpose: "activate" | "upgrade";
  issuedAt: string;
  nonce: string;
  /** 有效天数。0 或缺失表示永久有效（买断）。 */
  duration?: number;
  /** 售价（元），仅作卖家记录与界面展示用。 */
  price?: number;
}

export const DEFAULT_LICENSE_SECRET = "ai-novel-license-seed-2026";

export function resolveLicenseSecret(): string {
  return process.env.AI_NOVEL_LICENSE_SECRET?.trim() || DEFAULT_LICENSE_SECRET;
}

function sign(body: string): string {
  const digest = crypto
    .createHmac("sha256", resolveLicenseSecret())
    .update(body)
    .digest()
    .subarray(0, 10);
  return base32Encode(digest);
}

export function buildLicenseCode(payload: LicensePayload): string {
  const body = base32Encode(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}-${sign(body)}`;
}

export function parseLicenseCode(code: string): { payload: LicensePayload } {
  const normalized = code.trim().replace(/\s+/g, "");
  const dashIndex = normalized.lastIndexOf("-");
  if (dashIndex <= 0) {
    throw new Error("激活码格式不正确。");
  }
  const body = normalized.slice(0, dashIndex);
  const signature = normalized.slice(dashIndex + 1);
  const expected = sign(body);
  if (signature.length !== expected.length
    || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("激活码无效或已被篡改。");
  }
  let decoded: string;
  try {
    decoded = base32Decode(body).toString("utf8");
  } catch {
    throw new Error("激活码内容无法解析。");
  }
  const parsed = JSON.parse(decoded) as LicensePayload;
  if (!parsed
    || (parsed.edition !== "standard" && parsed.edition !== "premium")
    || (parsed.purpose !== "activate" && parsed.purpose !== "upgrade")) {
    throw new Error("激活码内容不完整。");
  }
  return { payload: parsed };
}
