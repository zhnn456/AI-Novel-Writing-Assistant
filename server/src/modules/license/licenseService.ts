import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
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
}

// ============================================================================
// Keygate 授权服务器配置
// ----------------------------------------------------------------------------
// 客户端激活/验证走本机 server 代理到 Keygate（Node fetch 无 CORS 限制）。
// 授权裁决最终在 Keygate 服务端：激活码唯一性、设备数、吊销、到期都由它强制。
// 桌面端本机无法绝对防破解，Keygate 的设备绑定 + 吊销 + 到期是真正的防线。
// ============================================================================
const KEYGATE_BASE_URL = process.env.KEYGATE_BASE_URL || "http://8.160.174.123:9000";
// 可从 GET /api/v1/license/pubkey 拉取，此处硬编码用于离线验签兜底（不含私钥）。
const KEYGATE_PUBLIC_KEY_HEX =
  "5c345f515036ee78a1e4efe749edee4705a277acafe5e488c48bf042954e787b";

// Keygate 后台定价套餐 id → 版本（与后台 /admin/plans 保持一致，改套餐需同步此处）。
const PLAN_EDITION_MAP: Record<string, LicenseEdition> = {
  "f46c1aac-e7db-42fd-8af6-0392bf91f5cf": "trial", // 试用版 · ¥0（7天体验）
  "16aba8e9-3c3e-4cb3-8b75-6e488ec806e4": "standard", // 标准版·半年引流 · ¥99/半年
  "a756bc95-74d7-4cd7-bc2a-d130fcb1e934": "standard", // 标准版·年付 · ¥199/年
  "625744cb-0028-48ae-b003-14a29b5e98bf": "premium", // 专业版·买断 · ¥399
};
const DEFAULT_PRICE: Record<LicenseEdition, number> = { trial: 0, standard: 199, premium: 399 };

const FILE_NAME = "license.json";
const IDENTIFIER_TYPE = "device";

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
  const activated = edition !== "none" && token.sts === "active" && token.did === fingerprint;
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
  };
}

// ----------------------------------------------------------------------------
// 调用 Keygate
// ----------------------------------------------------------------------------
async function postKeygate(
  pathname: string,
  payload: Record<string, unknown>,
): Promise<{ data: Record<string, unknown>; serverNow: number }> {
  let res: Response;
  try {
    res = await fetch(`${KEYGATE_BASE_URL}${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("授权服务器连接失败，请检查网络后重试。");
  }
  // 服务端时间优先（HTTP Date 头），拿不到再退回本机时间。
  const headerDate = Date.parse(res.headers.get("date") ?? "");
  const serverNow = Number.isFinite(headerDate) ? headerDate : Date.now();
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const code = (json as any)?.error?.code;
    const message = (json as any)?.error?.message;
    throw new Error(typeof message === "string" ? message : "授权服务器暂时不可用，请稍后再试。");
  }
  return { data: json.data as Record<string, unknown>, serverNow };
}

function resolveCurrentFingerprint(): string {
  return computeMachineFingerprint();
}

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

async function computeLicenseStatus(): Promise<LicenseStatus> {
  const cache = readCache();
  const state = readRuntimeState();
  if (!cache) {
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
    // 服务端可达时以服务端时间为准，同时刷新“上次在线”基线。
    noteServerTime(serverNow, state);
    const t = verifyToken(tokenRaw, serverNow);
    if (rawStatus !== "active" || !t) {
      // 吊销 / 停用 / 到期：明确未激活（不回退静默放行）
      writeCache({ licenseKey: cache.licenseKey, token: tokenRaw, planName });
      return notActivatedStatus();
    }
    const result = buildStatusFromToken(t, planName, serverNow);
    writeCache({ licenseKey: cache.licenseKey, token: tokenRaw, planName });
    return result;
  } catch {
    // 网络不可达：先做时间与离线时长判定，再用本地缓存令牌离线验签。
    const verdict: ClockVerdict = assessClock(state, true);
    if (verdict.blocked) {
      return notActivatedStatus();
    }
    const t = verifyToken(cache.token, verdict.now);
    if (!t || t.sts !== "active" || (t.vun && t.vun > 0 && Math.floor(verdict.now / 1000) > t.vun)) {
      return notActivatedStatus();
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
  if (status !== "activated" || !tokenRaw) {
    throw new Error("激活失败，请检查激活码是否有效。");
  }
  const t = verifyToken(tokenRaw, serverNow);
  if (!t) {
    throw new Error("激活响应校验失败，请稍后重试。");
  }
  // 激活即一次可信联网：把时间基线交给服务端时间。
  noteServerTime(serverNow, readRuntimeState());
  writeCache({ licenseKey: code.trim(), token: tokenRaw, planName: null });
  statusCache = null; // 激活成功后立即可见新状态（避免命中激活前 60s TTL 缓存）
  return buildStatusFromToken(t, null, serverNow);
}

/**
 * 升级/更换激活码。Keygate 无独立升级端点：升级等价于用更高版本的新激活码重新激活。
 */
export async function upgradeWithCode(code: string): Promise<LicenseStatus> {
  return activateWithCode(code);
}
