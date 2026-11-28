import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveIntegritySecret } from "./licenseSecrets";

/**
 * 客户端完整性自检（B）。
 *
 * 打包时对 server/dist 下自有代码生成一份哈希清单（dist/integrity.json），
 * 清单本身用内置密钥 HMAC 签名。运行时把磁盘上的文件重新算一遍：
 *  - 对不上 → 认为程序被改过，降级为「体验模式」（每本书 3 章）并提示用户，
 *    但**不退出、不锁死**，符合「到期只降级」的产品口径；
 *  - 清单不存在：开发/测试态视为未启用不误伤；打包态视为清单被删，按篡改降级处理。
 *
 * 诚实说明：这挡住的不是高手，而是「改完一行还能正常跑」这件事本身。
 * 攻击者要同时改代码、重算清单、重签 HMAC 才能不被发现，成本被抬高了。
 */

interface ManifestEntry {
  path: string;
  sha256: string;
}

interface Manifest {
  generatedAt?: string;
  files: ManifestEntry[];
  sig: string;
}

export interface IntegrityResult {
  ok: boolean;
  enabled: boolean;
  checked: number;
  tampered: string[];
}

const DIST_ROOT = path.resolve(__dirname, "../..");
const MANIFEST_PATH = path.join(DIST_ROOT, "integrity.json");
const SKIP_PREFIX = ["integrity.json", "node_modules/"];

let cachedResult: IntegrityResult | null = null;

/** 打包运行时：清单缺失＝被删掉，按篡改处理；开发/测试态才允许「未启用」。 */
function isPackagedRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.AI_NOVEL_DESKTOP_PACKAGED === "true";
}

function sha256File(filePath: string): string | null {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  } catch {
    return null;
  }
}

function canonical(files: ManifestEntry[]): string {
  return JSON.stringify(files.map((f) => [f.path, f.sha256]).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}

function verifyManifestSignature(manifest: Manifest): boolean {
  if (typeof manifest.sig !== "string" || !Array.isArray(manifest.files)) return false;
  const expected = crypto
    .createHmac("sha256", resolveIntegritySecret())
    .update(canonical(manifest.files))
    .digest("hex");
  const a = Buffer.from(manifest.sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * 校验一次（结果缓存；进程生命周期内程序文件不会变，除非有人在跑的时候改它）。
 */
export function verifyClientIntegrity(force = false): IntegrityResult {
  if (!force && cachedResult) return cachedResult;
  const disabled: IntegrityResult = { ok: true, enabled: false, checked: 0, tampered: [] };

  let manifest: Manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
  } catch {
    // 打包态没有清单，只可能是被删（构建流水线必写 integrity.json），否则校验等于形同虚设。
    if (isPackagedRuntime()) {
      cachedResult = { ok: false, enabled: true, checked: 0, tampered: ["integrity.json"] };
      return cachedResult;
    }
    cachedResult = disabled;
    return disabled;
  }
  if (!verifyManifestSignature(manifest)) {
    // 清单被改过（签名对不上）：等同于文件被动过，按篡改处理。
    cachedResult = { ok: false, enabled: true, checked: manifest.files?.length ?? 0, tampered: ["integrity.json"] };
    return cachedResult;
  }

  const tampered: string[] = [];
  for (const entry of manifest.files) {
    if (SKIP_PREFIX.some((prefix) => entry.path.startsWith(prefix))) continue;
    const actual = sha256File(path.join(DIST_ROOT, entry.path));
    if (!actual || actual !== entry.sha256) tampered.push(entry.path);
  }
  cachedResult = {
    ok: tampered.length === 0,
    enabled: true,
    checked: manifest.files.length,
    tampered: tampered.slice(0, 20),
  };
  return cachedResult;
}

/** 程序文件是否可信；开发态（无清单）一律返回 true。 */
export function isClientIntact(): boolean {
  return verifyClientIntegrity().ok;
}
