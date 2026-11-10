import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AppError } from "../../middleware/errorHandler";
import { resolveDataRoot } from "../../runtime/appPaths";
import { computeMachineFingerprint } from "./fingerprint";
import { resolveLicenseSecret } from "./licenseCodec";
import {
  assessClock,
  commitLocalProgress,
  noteServerTime,
  readRuntimeState,
  type ClockVerdict,
} from "./stateStore";

export type LicensePlan = "trial" | "standard" | "premium";
export type LicenseEdition = LicensePlan;

export interface LicenseStatus {
  activated: boolean;
  /** 是否绑定到当前这台机器。授权文件被复制到另一台机器时这里为 false。 */
  bound: boolean;
  edition: LicenseEdition | "none";
  machineFingerprint: string;
  activatedAt: string | null;
  plan: LicensePlan;
  /** 到期时间；null 表示永久有效（买断）。 */
  expiresAt: string | null;
  /** 剩余有效天数；null 表示永久。 */
  remainingDays: number | null;
  /** 是否已过期。 */
  expired: boolean;
  /** 售价（元），卖家记录用。 */
  price: number | null;
  /** Keygate 套餐名（后台配置），界面展示用。 */
  planName: string | null;
  /** 邮箱领取 7 天试用授权的公开入口；未激活时界面据此引导。 */
  trialSignupUrl: string | null;
}

// ============================================================================
// Keygate 授权服务器配置
// ----------------------------------------------------------------------------
// 客户端激活/验证走本机 server 代理到 Keygate（Node fetch 无 CORS 限制）。
// 授权裁决最终在 Keygate 服务端：激活码唯一性、设备数、吊销、到期都由它强制。
// 桌面端本机无法绝对防破解，Keygate 的设备绑定 + 吊销 + 到期是真正的防线。
// ============================================================================
const KEYGATE_BASE_URL = process.env.KEYGATE_BASE_URL || "https://keygate.de5.net";
// 可从 GET /api/v1/license/pubkey 拉取，此处硬编码用于离线验签兜底（不含私钥）。
const KEYGATE_PUBLIC_KEY_HEX =
  "5c345f515036ee78a1e4efe749edee4705a277acafe5e488c48bf042954e787b";

// Keygate 后台定价套餐 id → 版本（与后台 /admin/plans 保持一致，改套餐需同步此处）。
const PLAN_EDITION_MAP: Record<string, LicenseEdition> = {
  "76ed9d8a5394b2aea796d71a0b64178d": "trial", // 试用版 · ¥0（7天体验）
  "f53b0d7954a813c021eb881dc69cb3c3": "standard", // 标准版·半年引流 · ¥99/半年
  "6b57206bc68b5462357328e29c508bcf": "standard", // 标准版·年付 · ¥199/年
  "7daff0cb59e9160fe5224a79dc50c6be": "premium", // 专业版·买断 · ¥399
};
const DEFAULT_PRICE: Record<LicenseEdition, number> = { trial: 0, standard: 199, premium: 399 };

const FILE_NAME = "license.json";
const IDENTIFIER_TYPE = "device";

/**
 * 邮箱领取 7 天试用的公开入口：Keygate 后台试用套餐开启了 self_signup，
 * 访客在这里填邮箱 → 收验证码 → 自动发一张 7 天试用授权码到邮箱。
 * 试用记在 Keygate 服务端（一个邮箱每产品只能领一次），删本地文件无效。
 */
const TRIAL_SIGNUP_URL =
  process.env.KEYGATE_TRIAL_SIGNUP_URL || "https://keygate.de5.net/signup/fcec613a";

/**
 * Keygate 离线可验证令牌（Ed25519 签名）的解码视图。
 * 仅含客户端需要判定的字段；签发/验签在 Keygate 服务端。
 */
interface VerifyToken {
  lid: string;
  pid: string;
  pln: string; // plan_id
  sts: string; // 激活时的 license 状态
  did: string; // 绑定设备 identifier
  iat: number;
  exp: number; // 令牌自身检查间隔（非授权到期）
  vun?: number; // 授权到期 unix 秒；缺省 = 永久
  grc: number;
  nce: string;
  fpr?: string;
}

// ----------------------------------------------------------------------------
// 本地缓存（HMAC 签名防篡改）
// ----------------------------------------------------------------------------
interface CachedState {
  savedAt: string;
  licenseKey: string;
  token: string;
  planName: string | null;
  /** 对 {licenseKey, token, planName} 的 HMAC 签名，防用户手改伪造已激活。 */
  signature?: string;
}

function signState(state: Omit<CachedState, "signature" | "savedAt">): string {
  const canonical = JSON.stringify({
    k: state.licenseKey,
    t: state.token,
    p: state.planName,
  });
  return crypto.createHmac("sha256", resolveLicenseSecret()).update(canonical).digest("hex");
}

function verifyState(state: CachedState): boolean {
  if (!state.signature) return false;
  const expected = signState(state);
  const a = Buffer.from(state.signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function resolveCacheFilePath(): string {
  return path.join(resolveDataRoot(), FILE_NAME);
}

function readCache(): CachedState | null {
  try {
    const raw = fs.readFileSync(resolveCacheFilePath(), "utf8");
    const parsed = JSON.parse(raw) as CachedState;
    if (parsed && typeof parsed.licenseKey === "string" && parsed.token
      && typeof parsed.token === "string" && verifyState(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCache(state: Omit<CachedState, "savedAt" | "signature">): void {
  try {
    const filePath = resolveCacheFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const payload: CachedState = {
      savedAt: new Date().toISOString(),
      licenseKey: state.licenseKey,
      token: state.token,
      planName: state.planName,
      signature: signState(state),
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  } catch {
    // 缓存写失败不影响主流程
  }
}

// ----------------------------------------------------------------------------
// Keygate Ed25519 令牌验签
// ----------------------------------------------------------------------------
function publicKeyObject(): crypto.KeyObject {
  // ed25519 SPKI 前缀 + 32 字节原始公钥
  const spki = Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"),
    Buffer.from(KEYGATE_PUBLIC_KEY_HEX, "hex"),
  ]);
  return crypto.createPublicKey({ key: spki, format: "der", type: "spki" });
}

function verifyToken(raw: string, nowMs: number = Date.now()): VerifyToken | null {
  try {
    const idx = raw.lastIndexOf(".");
    if (idx < 0) return null;
    const payloadB64 = raw.slice(0, idx);
    const sigB64 = raw.slice(idx + 1);
    // Keygate 对 base64url 字符串的 UTF-8 字节签名（见 token.go：ed25519.Sign(priv, []byte(b64))）
    const payloadMsg = Buffer.from(payloadB64, "utf8");
    const sig = Buffer.from(sigB64, "base64url");
    const ok = crypto.verify(null, payloadMsg, publicKeyObject(), sig);
    if (!ok) return null;
    const parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as VerifyToken;
    if (!parsed || typeof parsed.pln !== "string" || typeof parsed.sts !== "string") return null;
    if (parsed.exp > 0 && Math.floor(nowMs / 1000) > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function editionOfPlan(planId: string): LicenseEdition | "none" {
  return PLAN_EDITION_MAP[planId] ?? "none";
}

function buildStatusFromToken(token: VerifyToken, planName: string | null, nowMs: number = Date.now()): LicenseStatus {
  const fingerprint = computeMachineFingerprint();
  const edition = editionOfPlan(token.pln);
  // Keygate 的试用授权状态是 trialing，正式购买是 active，两者都算有效授权。
  const licenseLive = token.sts === "active" || token.sts === "trialing";
  const activated = edition !== "none" && licenseLive && token.did === fingerprint;
  const expiresAt = token.vun && token.vun > 0 ? new Date(token.vun * 1000).toISOString() : null;
  const days = expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - nowMs) / 86_400_000))
    : null;
  const expired = Boolean(expiresAt && new Date(expiresAt).getTime() < nowMs);
  return {
    activated,
    bound: token.did === fingerprint,
    edition: token.did === fingerprint ? edition : "none",
    machineFingerprint: fingerprint,
    activatedAt: token.iat ? new Date(token.iat * 1000).toISOString() : null,
    plan: activated ? edition : "trial",
    expiresAt: token.did === fingerprint ? expiresAt : null,
    remainingDays: token.did === fingerprint ? days : null,
    expired: token.did === fingerprint ? expired : false,
    price: activated ? (DEFAULT_PRICE[edition] ?? null) : null,
    planName,
    trialSignupUrl: TRIAL_SIGNUP_URL,
  };
}

function notActivatedStatus(): LicenseStatus {
  const fingerprint = computeMachineFingerprint();
  return {
    activated: false,
    bound: false,
    edition: "none",
    machineFingerprint: fingerprint,
    activatedAt: null,
    plan: "trial",
    expiresAt: null,
    remainingDays: null,
    expired: false,
    price: null,
    planName: null,
    trialSignupUrl: TRIAL_SIGNUP_URL,
  };
}

// ----------------------------------------------------------------------------
// 调用 Keygate
// ----------------------------------------------------------------------------

/**
 * Keygate 返回的 error.message 是英文，直接甩到界面上客户看不懂。
 * 这里按 error.code 翻成中文；英文原文只写日志，不给客户看。
 * 新增 code 时在这里补一条，兜底永远返回中文。
 */
const KEYGATE_ERROR_ZH: Record<string, string> = {
  LICENSE_NOT_FOUND: "激活码不存在，请检查是否输入完整、有没有多余空格。",
  ACTIVATION_LIMIT: "这个激活码已达可激活设备上限。如需换电脑，请先在旧电脑解绑，或联系客服。",
  DEVICE_HELD: "这个激活码已绑定到另一台设备，请联系客服处理换机。",
  SESSION_HELD: "这个激活码正在另一台设备上使用，请先在那台设备退出。",
  FLOATING_LIMIT: "同时在线的设备数已达上限，请先关闭其他设备上的软件。",
  SEAT_LIMIT: "席位已满，请联系管理员调整。",
  LICENSE_EXPIRED: "许可证已到期，续费后重新激活即可继续使用。",
  LICENSE_SUSPENDED: "许可证已被停用，请联系客服核实。",
  INVALID_INPUT: "输入格式有误，请检查激活码后重试。",
  BAD_REQUEST: "请求参数有误，请检查激活码后重试。",
  UNAUTHORIZED: "授权服务器拒绝了本次请求，请稍后重试。",
  INTERNAL_ERROR: "授权服务器暂时不可用，请稍后再试。",
};

function keygateErrorToChinese(code: unknown, message: unknown): string {
  if (typeof code === "string" && KEYGATE_ERROR_ZH[code]) return KEYGATE_ERROR_ZH[code];
  console.warn("[license] Keygate 返回未映射的错误：", code, message);
  return "激活失败，请确认激活码是否正确；多次失败可联系客服。";
}

async function postKeygate(
  pathname: string,
  payload: Record<string, unknown>,
): Promise<{ data: Record<string, unknown>; serverNow: number }> {
  // 授权服务器在香港，国内网络到它偶发连不上（实测约两成连接超时）。
  // 单次失败就报错会让用户误以为激活码无效，所以这里做有限次重试：
  // 每次 12s 超时、间隔递增，最多 3 次；仍失败才报网络问题。
  let res: Response | null = null;
  for (let attempt = 1; attempt <= 3 && !res; attempt += 1) {
    try {
      res = await fetch(`${KEYGATE_BASE_URL}${pathname}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12_000),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[license] Keygate 第 ${attempt} 次连接失败：`, reason);
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  if (!res) {
    throw new AppError("连接授权服务器失败，请检查网络或代理后重试；多次失败可联系客服。", 502);
  }
  // 服务端时间优先（HTTP Date 头），拿不到再退回本机时间。
  const headerDate = Date.parse(res.headers.get("date") ?? "");
  const serverNow = Number.isFinite(headerDate) ? headerDate : Date.now();
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const code = (json as any)?.error?.code;
    const message = (json as any)?.error?.message;
    if (res.status === 429 && !code) {
      throw new AppError("激活请求过于频繁，请等待约 1 分钟后再试。", 429);
    }
    throw new AppError(keygateErrorToChinese(code, message), 400);
  }
  return { data: json.data as Record<string, unknown>, serverNow };
}

function resolveCurrentFingerprint(): string {
  return computeMachineFingerprint();
}

// ----------------------------------------------------------------------------
// 试用：由 Keygate 邮箱领取，授权存在服务端
// ----------------------------------------------------------------------------
// 早期版本在本地写 trial.json 自动开通 7 天，删掉数据目录或卸载重装即可重置，
// 等于白送。现在试用统一走 Keygate 的 self_signup：用户填邮箱拿到一张 7 天
// 试用授权码，一个邮箱每个产品只能领一次，本地只保存正常的激活缓存。
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// 对外接口
// ----------------------------------------------------------------------------
// 内存 TTL 缓存，避免每个业务请求都联网 verify Keygate。
let statusCache: { at: number; status: LicenseStatus } | null = null;
const STATUS_TTL_MS = 60_000;

/**
 * 读取授权状态。优先联网问 Keygate（能反映吊销/订阅到期）；
 * 网络不可达时回退到本地缓存令牌的 Ed25519 验签判断。
 * 校验失败或令牌过期时明确返回"未激活"，绝不静默放行。
 */
export async function getLicenseStatus(): Promise<LicenseStatus> {
  const now = Date.now();
  if (statusCache && now - statusCache.at < STATUS_TTL_MS) {
    return statusCache.status;
  }
  const status = await computeLicenseStatus();
  statusCache = { at: Date.now(), status };
  return status;
}

/** 激活码无效/过期时，直接判为未激活，由界面引导领取或重新激活。 */
function fallbackAfterInvalidLicense(): LicenseStatus {
  return notActivatedStatus();
}

async function computeLicenseStatus(): Promise<LicenseStatus> {
  const cache = readCache();
  const state = readRuntimeState();
  if (!cache) {
    // 没有激活码 → 未激活，界面引导去领 7 天试用或购买
    return notActivatedStatus();
  }
  const fingerprint = resolveCurrentFingerprint();
  try {
    const { data, serverNow } = await postKeygate("/api/v1/license/verify", {
      license_key: cache.licenseKey,
      identifier: fingerprint,
      identifier_type: IDENTIFIER_TYPE,
    });
    const rawStatus = typeof data.status === "string" ? data.status : "unknown";
    const tokenRaw = typeof data.token === "string" ? data.token : "";
    const planName = typeof data.plan_name === "string" ? data.plan_name : cache.planName;
    noteServerTime(serverNow, state);
    const t = verifyToken(tokenRaw, serverNow);
    if (!(rawStatus === "active" || rawStatus === "trialing") || !t) {
      writeCache({ licenseKey: cache.licenseKey, token: tokenRaw, planName });
      return fallbackAfterInvalidLicense();
    }
    const result = buildStatusFromToken(t, planName, serverNow);
    writeCache({ licenseKey: cache.licenseKey, token: tokenRaw, planName });
    return result;
  } catch {
    const verdict: ClockVerdict = assessClock(state, true);
    if (verdict.blocked) {
      return fallbackAfterInvalidLicense();
    }
    const t = verifyToken(cache.token, verdict.now);
    if (
      !t ||
      (t.sts !== "active" && t.sts !== "trialing") ||
      (t.vun && t.vun > 0 && Math.floor(verdict.now / 1000) > t.vun)
    ) {
      return fallbackAfterInvalidLicense();
    }
    commitLocalProgress(state);
    return buildStatusFromToken(t, cache.planName, verdict.now);
  }
}

/** 用激活码（Keygate 发码）在本机激活。 */
export async function activateWithCode(code: string): Promise<LicenseStatus> {
  const fingerprint = resolveCurrentFingerprint();
  const { data, serverNow } = await postKeygate("/api/v1/license/activate", {
    license_key: code.trim(),
    identifier: fingerprint,
    identifier_type: IDENTIFIER_TYPE,
    label: "鲸喜AI写作",
  });
  const status = typeof data.status === "string" ? data.status : "unknown";
  const tokenRaw = typeof data.token === "string" ? data.token : "";
  // 同一台机器再点一次激活，Keygate 回 already_activated，同样算激活成功。
  if ((status !== "activated" && status !== "already_activated") || !tokenRaw) {
    throw new AppError("激活失败，请检查激活码是否有效。", 400);
  }
  const t = verifyToken(tokenRaw, serverNow);
  if (!t) {
    throw new AppError("激活响应校验失败，请稍后重试。", 502);
  }
  // 激活即一次可信联网：把时间基线交给服务端时间。
  const planName = typeof data.plan_name === "string" ? data.plan_name : null;
  noteServerTime(serverNow, readRuntimeState());
  writeCache({ licenseKey: code.trim(), token: tokenRaw, planName });
  statusCache = null; // 激活成功后立即可见新状态（避免命中激活前 60s TTL 缓存）
  return buildStatusFromToken(t, planName, serverNow);
}

/**
 * 升级/更换激活码。Keygate 无独立升级端点：升级等价于用更高版本的新激活码重新激活。
 */
export async function upgradeWithCode(code: string): Promise<LicenseStatus> {
  return activateWithCode(code);
}

// ----------------------------------------------------------------------------
// 应用内试用弹窗：直接调 Keygate self-signup API，不跳浏览器
// ----------------------------------------------------------------------------

/** 从 TRIAL_SIGNUP_URL 提取 checkout_id（URL 末尾那 8 位）。 */
function trialCheckoutId(): string {
  const m = TRIAL_SIGNUP_URL.match(/\/signup\/([a-zA-Z0-9]+)/);
  return m?.[1] ?? "";
}

/** 发送试用注册验证码到邮箱。 */
export async function trialSendOtp(email: string): Promise<{ sent: true }> {
  const checkoutId = trialCheckoutId();
  if (!checkoutId) throw new AppError("试用注册入口未配置。", 500);
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AppError("请输入有效的邮箱地址。", 400);
  }
  await postKeygate(`/api/v1/signup/${checkoutId}/send`, { email: normalized });
  return { sent: true };
}

/**
 * 验证邮箱验证码。Keygate 返回 license_key 后立即用本机指纹激活，
 * 用户全程不需要手动复制粘贴。
 */
export async function trialVerifyOtp(email: string, code: string): Promise<LicenseStatus> {
  const checkoutId = trialCheckoutId();
  if (!checkoutId) throw new AppError("试用注册入口未配置。", 500);
  const normalized = email.trim().toLowerCase();
  const trimmedCode = code.trim();
  if (!trimmedCode) throw new AppError("请输入收到的验证码。", 400);

  // 调 Keygate verify，成功后响应里带 license_key
  const { data } = await postKeygate(`/api/v1/signup/${checkoutId}/verify`, {
    email: normalized,
    code: trimmedCode,
  });
  const licenseKey = typeof data.license_key === "string" ? data.license_key : "";
  if (!licenseKey) {
    throw new AppError("验证码已确认，但未获取到授权码，请检查邮箱。", 502);
  }
  // 自动用本机指纹激活
  return activateWithCode(licenseKey);
}
