import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveDataRoot } from "../../runtime/appPaths";
import { computeMachineFingerprint } from "./fingerprint";
import { resolveLicenseSecret } from "./licenseCodec";

/**
 * 本地运行状态：最近一次可信时间、上次成功联网时间、试用已用次数。
 * 落盘为加密+认证的二进制块，避免以明文 JSON 暴露字段含义，也避免被直接改写。
 */
export interface RuntimeState {
  v: 1;
  /** 见过的最大可信时间（毫秒） */
  seen: number;
  /** 上次与授权服务成功通信的时间（毫秒），0 表示从未 */
  online: number;
  /** 已消耗的生成次数 */
  used: number;
}

const STATE_FILE = "cache.state";
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const CLOCK_TOLERANCE_MS = 10 * 60 * 1000;
const FORWARD_JUMP_LIMIT_MS = 24 * 60 * 60 * 1000;
const OFFLINE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

function stateFilePath(): string {
  return path.join(resolveDataRoot(), STATE_FILE);
}

function deriveKey(salt: Buffer): Buffer {
  const material = `${resolveLicenseSecret()}|${computeMachineFingerprint()}|runtime`;
  return crypto.scryptSync(material, salt, 32);
}

function emptyState(): RuntimeState {
  return { v: 1, seen: 0, online: 0, used: 0 };
}

function normalize(raw: unknown): RuntimeState {
  const value = raw as Partial<RuntimeState> | null;
  if (!value || value.v !== 1) return emptyState();
  const num = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0);
  return {
    v: 1,
    seen: num(value.seen),
    online: num(value.online),
    used: num(value.used),
  };
}

export function readRuntimeState(): RuntimeState | null {
  try {
    const packed = fs.readFileSync(stateFilePath());
    if (packed.length <= SALT_LEN + IV_LEN + TAG_LEN) return null;
    const salt = packed.subarray(0, SALT_LEN);
    const iv = packed.subarray(SALT_LEN, SALT_LEN + IV_LEN);
    const tag = packed.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
    const body = packed.subarray(SALT_LEN + IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(salt), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(body), decipher.final()]);
    return normalize(JSON.parse(plain.toString("utf8")));
  } catch {
    // 缺失、被改动、换机器都会走到这里：一律当作没有可信状态
    return null;
  }
}

export function writeRuntimeState(state: RuntimeState): void {
  try {
    const salt = crypto.randomBytes(SALT_LEN);
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(salt), iv);
    const body = Buffer.concat([
      cipher.update(JSON.stringify(normalize(state)), "utf8"),
      cipher.final(),
    ]);
    const packed = Buffer.concat([salt, iv, cipher.getAuthTag(), body]);
    const filePath = stateFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, packed);
    fs.renameSync(tmp, filePath);
  } catch {
    // 写失败不影响主流程
  }
}

export interface ClockVerdict {
  /** 判定授权时使用的时间（毫秒） */
  now: number;
  /** 是否处于不可信状态 */
  blocked: boolean;
  /** 说明，仅供日志，不回传给界面 */
  reason: "rollback" | "offline" | "legacy" | null;
}

/**
 * 判断本机时间与离线时长是否还值得信任：
 * - 本地时间明显早于历史见过的最大时间 → 视为回拨
 * - 距上次成功联网超过宽限期 → 视为长期离线
 * - 有授权缓存但没有任何可信状态（例如状态文件被删除）→ 必须重新联网
 */
export function assessClock(state: RuntimeState | null, hasStoredLicense: boolean): ClockVerdict {
  const local = Date.now();
  if (!state) {
    return {
      now: local,
      blocked: hasStoredLicense,
      reason: hasStoredLicense ? "legacy" : null,
    };
  }
  const effective = Math.max(local, state.seen);
  if (state.seen > 0 && local < state.seen - CLOCK_TOLERANCE_MS) {
    return { now: effective, blocked: true, reason: "rollback" };
  }
  if (state.online > 0 && effective - state.online > OFFLINE_GRACE_MS) {
    return { now: effective, blocked: true, reason: "offline" };
  }
  return { now: effective, blocked: false, reason: null };
}

/** 记录一次可信时间：优先用服务端时间，离线时只允许有限前进。 */
export function commitLocalProgress(state: RuntimeState | null): void {
  const base = state ?? emptyState();
  const local = Date.now();
  if (local <= base.seen) return;
  const ceiling = base.seen > 0 ? base.seen + FORWARD_JUMP_LIMIT_MS : local;
  const seen = Math.min(local, ceiling);
  if (seen > base.seen) {
    writeRuntimeState({ ...base, seen });
  }
}

/** 与服务端通信成功：以服务端时间为准重置信任基线。 */
export function noteServerTime(serverNow: number, state: RuntimeState | null): void {
  const base = state ?? emptyState();
  writeRuntimeState({
    ...base,
    seen: Math.max(base.seen, serverNow),
    online: serverNow,
  });
}

export interface QuotaResult {
  used: number;
  limit: number;
  allowed: boolean;
}

export function readQuota(limit: number): QuotaResult {
  const state = readRuntimeState();
  const used = state?.used ?? 0;
  return { used, limit, allowed: used < limit };
}

/** 原子地占用一次额度：只在未超限时递增。 */
export function consumeQuota(limit: number): QuotaResult {
  const state = readRuntimeState() ?? emptyState();
  if (state.used >= limit) {
    return { used: state.used, limit, allowed: false };
  }
  const next = { ...state, used: state.used + 1 };
  writeRuntimeState(next);
  return { used: next.used, limit, allowed: true };
}

export const QUOTA_OFFLINE_GRACE_MS = OFFLINE_GRACE_MS;
export const QUOTA_CLOCK_TOLERANCE_MS = CLOCK_TOLERANCE_MS;
