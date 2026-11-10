import { callKeygate, getLicenseIdentity } from "./licenseService";

/**
 * 客户端埋点（E）：把「这台机器上的程序被改过」「票据拿不到」这类信号
 * 报到 Keygate，后台在许可证详情页能看到。它不参与任何授权判断，
 * 只是留痕：破解版流传时能定位到是哪张许可证/哪台设备在异常运行。
 *
 * 本地限流：同一类型每小时最多 3 次，避免断网时反复重试把日志刷爆。
 */

const EVENT_TIMEOUT_MS = 2_500;
const SEND_INTERVAL_MS = 60 * 60 * 1000;
const MAX_PER_KIND = 3;

const sent: Record<string, { count: number; windowStart: number }> = {};

export type ClientEventKind = "tamper" | "ticket" | "export" | "offline" | "version" | "allowance";

function withinQuota(kind: string): boolean {
  const now = Date.now();
  const entry = sent[kind];
  if (!entry || now - entry.windowStart > SEND_INTERVAL_MS) {
    sent[kind] = { count: 1, windowStart: now };
    return true;
  }
  if (entry.count >= MAX_PER_KIND) return false;
  entry.count += 1;
  return true;
}

/** 采集端不等待结果：失败就丢掉，绝不因为上报失败影响用户。 */
export function reportClientEvent(kind: ClientEventKind, detail: string, appVersion = ""): void {
  const identity = getLicenseIdentity();
  if (!identity) return;
  if (!withinQuota(kind)) return;
  void withTimeout(
    callKeygate("/api/v1/license/books/events", {
      license_key: identity.licenseKey,
      identifier: identity.fingerprint,
      kind,
      detail: detail.slice(0, 500),
      app_version: appVersion.slice(0, 32),
    }),
    EVENT_TIMEOUT_MS,
  ).catch(() => undefined);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
