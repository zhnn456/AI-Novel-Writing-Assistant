import fs from "node:fs";
import path from "node:path";
import { resolveDataRoot } from "../../runtime/appPaths";
import { computeMachineFingerprint } from "./fingerprint";
import type { LicenseEdition } from "./licenseCodec";

export type LicensePlan = "trial" | "standard" | "premium";

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
  /** 是否已过期（仅作展示，本轮不强制锁功能）。 */
  expired: boolean;
  /** 售价（元），卖家记录用。 */
  price: number | null;
}

const FILE_NAME = "license.json";
const DEFAULT_SERVER_URL = "http://localhost:3400";

/**
 * 授权服务器地址。桌面打包时注入 AI_NOVEL_LICENSE_SERVER_URL 指向卖家服务器；
 * 本地开发默认 localhost:3400。真正的裁决在服务器上，这里只负责调用。
 */
export function resolveLicenseServerUrl(): string {
  return (
    process.env.AI_NOVEL_LICENSE_SERVER_URL
    || process.env.LICENSE_SERVER_URL
    || DEFAULT_SERVER_URL
  );
}

function resolveLicenseFilePath(): string {
  return path.join(resolveDataRoot(), FILE_NAME);
}

/** 本地缓存：最近一次从服务器校验通过的结果，用于断网时兜底。 */
interface CachedStatus {
  savedAt: string;
  status: LicenseStatus;
}

function trialStatus(): LicenseStatus {
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
  };
}

function readCache(): LicenseStatus | null {
  try {
    const raw = fs.readFileSync(resolveLicenseFilePath(), "utf8");
    const parsed = JSON.parse(raw) as CachedStatus;
    if (parsed && parsed.status && typeof parsed.status.activated === "boolean") {
      return parsed.status;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCache(status: LicenseStatus): void {
  try {
    const filePath = resolveLicenseFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const payload: CachedStatus = { savedAt: new Date().toISOString(), status };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  } catch {
    // 缓存写失败不影响主流程
  }
}

/** 把服务器返回的授权状态映射成客户端统一结构，并补算剩余天数。 */
function mapServerStatus(raw: Record<string, unknown>): LicenseStatus {
  const fingerprint = computeMachineFingerprint();
  const activated = Boolean(raw.activated);
  const bound = Boolean(raw.bound);
  const edition: LicenseEdition | "none" =
    raw.edition === "premium" ? "premium" : raw.edition === "standard" ? "standard" : "none";
  const expiresAt = typeof raw.expiresAt === "string" ? raw.expiresAt : null;
  const days = expiresAt
    ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000)
    : null;
  return {
    activated,
    bound,
    edition: bound ? edition : "none",
    machineFingerprint: fingerprint,
    activatedAt: typeof raw.activatedAt === "string" ? raw.activatedAt : null,
    plan: activated && bound ? edition : "trial",
    expiresAt: bound ? expiresAt : null,
    remainingDays: bound ? days : null,
    expired: bound ? Boolean(raw.expired) : false,
    price: typeof raw.price === "number" ? raw.price : null,
  };
}

async function postServer(pathname: string, payload: Record<string, unknown>) {
  let res: Response;
  try {
    res = await fetch(`${resolveLicenseServerUrl()}${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("授权服务器连接失败，请稍后再试。");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(typeof json.error === "string" ? json.error : "授权服务器暂时不可用，请稍后再试。");
  }
  return json.data as Record<string, unknown>;
}

/**
 * 读取授权状态。优先问服务器（能反映吊销/订阅到期）；
 * 服务器连不上时回退到本地最近一次通过的缓存，保证断网也能用。
 */
export async function getLicenseStatus(): Promise<LicenseStatus> {
  const fingerprint = computeMachineFingerprint();
  try {
    const res = await fetch(
      `${resolveLicenseServerUrl()}/api/license/status?fingerprint=${encodeURIComponent(fingerprint)}`,
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      throw new Error(typeof json.error === "string" ? json.error : "授权服务器暂时不可用。");
    }
    const status = mapServerStatus(json.data as Record<string, unknown>);
    writeCache(status);
    return status;
  } catch {
    const cached = readCache();
    return cached ?? trialStatus();
  }
}

export async function activateWithCode(code: string): Promise<LicenseStatus> {
  const fingerprint = computeMachineFingerprint();
  const data = await postServer("/api/license/activate", { code, fingerprint });
  const status = mapServerStatus(data);
  writeCache(status);
  return status;
}

export async function upgradeWithCode(code: string): Promise<LicenseStatus> {
  const fingerprint = computeMachineFingerprint();
  const data = await postServer("/api/license/upgrade", { code, fingerprint });
  const status = mapServerStatus(data);
  writeCache(status);
  return status;
}
