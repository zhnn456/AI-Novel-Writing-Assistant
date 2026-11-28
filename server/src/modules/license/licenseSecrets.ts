/**
 * 授权相关密钥的唯一定义处。
 *
 * 历史教训：0.5.30 及更早版本使用种子 "ai-novel-license-seed-2026"，该种子在
 * 0.5.30 安全取证（安装包静态分析）中被提取并实测可离线铸出 premium 激活码，
 * 视为已永久泄露。任何新机制严禁复用旧种子。
 *
 * 轮换流程：把下面的默认值整体替换为新的随机 hex
 * （node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"），
 * 同步更新 desktop/scripts/obfuscate-server-dist.cjs 里的同名默认值，然后全量发新版。
 */

/** 本地密钥：stateStore 运行态加密材料、licenseService 状态签名（signState）。 */
const DEFAULT_LICENSE_SECRET = "36a9b7c1b4293c9d5c6ed04fca843e7d9c7963eb8de5fe4d";

/** 完整性清单专用密钥：与本地授权密钥解耦，单把泄露不波及另一把。 */
const DEFAULT_INTEGRITY_SECRET = "bb5492a1ef81a2e35c3bc07a362a5b88a3e211f1c2caf3dd";

/**
 * 环境变量覆盖只给开发与测试用。
 *
 * 打包运行时 NODE_ENV=production，此时一律忽略 AI_NOVEL_LICENSE_SECRET /
 * AI_NOVEL_INTEGRITY_SECRET 等覆盖，否则用户在自己机器上设一个环境变量，
 * 就能用同一套签名密钥伪造状态、或让两台机器拿到同一指纹（一码多机）。
 * 只有显式打开 AI_NOVEL_ALLOW_SECRET_OVERRIDES=1 才放行（内网排查专用）。
 */
export function allowSecretOverrides(): boolean {
  if (process.env.AI_NOVEL_ALLOW_SECRET_OVERRIDES === "1") return true;
  return process.env.NODE_ENV !== "production";
}

let overrideIgnoredLogged = false;

function readOverride(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  if (allowSecretOverrides()) return raw;
  if (!overrideIgnoredLogged) {
    overrideIgnoredLogged = true;
    console.warn(`[license] 已忽略环境变量 ${name}：生产运行时不允许用环境变量覆盖授权密钥。`);
  }
  return undefined;
}

export function resolveLicenseSecret(): string {
  return readOverride("AI_NOVEL_LICENSE_SECRET") || DEFAULT_LICENSE_SECRET;
}

export function resolveIntegritySecret(): string {
  return readOverride("AI_NOVEL_INTEGRITY_SECRET") || DEFAULT_INTEGRITY_SECRET;
}

/**
 * 已泄露、仅用于"读懂旧版数据"的种子，禁止用于签发任何新内容。
 *
 * 0.5.31 换了新种子后，老用户的 license.json（HMAC 签名）与 cache.state
 * （AES 密钥派生）都是旧种子算出来的。只换种子不做兼容，等于把已付费用户
 * 升级后打成未激活，所以读取时按「新种子 → 旧种子」顺序试，命中旧种子就
 * 立刻用新种子重写一份，之后再也用不上这里。
 */
const LEGACY_LICENSE_SECRETS = ["ai-novel-license-seed-2026"];

export function resolveLegacyLicenseSecrets(): string[] {
  const extra = (readOverride("AI_NOVEL_LEGACY_LICENSE_SECRETS") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set([...extra, ...LEGACY_LICENSE_SECRETS])].filter(
    (secret) => secret !== resolveLicenseSecret(),
  );
}
