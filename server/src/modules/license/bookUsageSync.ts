import {
  callKeygate,
  getLicenseIdentity,
  getLicenseStatus,
  invalidateStatusCache,
} from "./licenseService";
import { listBooks, mergeFromServer } from "./usageLedger";

/**
 * 与服务端（Keygate book_usage 表）的额度对账。
 *
 * 三条规则：
 *  1. 只增不减：服务端存的是「历史上用掉的最大章数」，重装/改本地文件都拿不回额度。
 *  2. 离线不判违规：拉不到就沿用本地值，绝不因为断网把人拦在门外。
 *  3. 不阻塞生成：拉取最多等 3 秒，超时即按本地值走。
 */

const PULL_TIMEOUT_MS = 3_000;
const HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000;

interface ServerBook {
  novel_id?: unknown;
  used?: unknown;
  updated_at?: unknown;
}

function normalizeBooks(raw: unknown): Array<{ novelId: string; used: number; updatedAt?: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ novelId: string; used: number; updatedAt?: string }> = [];
  for (const item of raw as ServerBook[]) {
    const novelId = typeof item?.novel_id === "string" ? item.novel_id : "";
    const used = typeof item?.used === "number" ? item.used : Number(item?.used);
    if (!novelId || !Number.isFinite(used) || used < 0) continue;
    out.push({
      novelId,
      used,
      updatedAt: typeof item?.updated_at === "string" ? item.updated_at : undefined,
    });
  }
  return out;
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

/** 从服务端拉回这台设备的书额度，覆盖本地账本。失败返回 false（不当作违规）。 */
let lastPullAt = 0;
const PULL_THROTTLE_MS = 60_000;

export async function pullBookUsage(force = false): Promise<boolean> {
  const identity = getLicenseIdentity();
  if (!identity) return false;
  // 生成前、心跳、页面查询都会调这里，成功拉取后 60 秒内复用结果，别每次都等网络。
  if (!force && Date.now() - lastPullAt < PULL_THROTTLE_MS) return true;
  try {
    const { data } = await withTimeout(
      callKeygate("/api/v1/license/books/status", {
        license_key: identity.licenseKey,
        identifier: identity.fingerprint,
      }),
      PULL_TIMEOUT_MS,
    );
    mergeFromServer(normalizeBooks(data.books));
    lastPullAt = Date.now();
    return true;
  } catch (error) {
    console.warn("[license] 拉取书额度失败，沿用本地账本：", error instanceof Error ? error.message : error);
    return false;
  }
}

/** 把本地账本上报给服务端（生成成功后调用，失败下次心跳再补）。 */
export async function reportBookUsage(): Promise<void> {
  const identity = getLicenseIdentity();
  const books = listBooks();
  if (!identity || books.length === 0) return;
  try {
    const { data } = await withTimeout(
      callKeygate("/api/v1/license/books/report", {
        license_key: identity.licenseKey,
        identifier: identity.fingerprint,
        books: books.map((book) => ({ novel_id: book.novelId, used: book.used })),
      }),
      PULL_TIMEOUT_MS,
    );
    mergeFromServer(normalizeBooks(data.books));
  } catch (error) {
    console.warn("[license] 上报书额度失败，下次心跳重试：", error instanceof Error ? error.message : error);
  }
}

/**
 * 心跳：定期联网 verify（顺带刷新 Keygate 后台的「最后验证时间」）并做一次额度对账。
 * 这样吊销/解绑在半小时内生效，用户重装后也能立刻看到真实剩余章数。
 */
export function startLicenseHeartbeat(intervalMs: number = HEARTBEAT_INTERVAL_MS): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      invalidateStatusCache();
      await getLicenseStatus();
      await pullBookUsage();
    } catch (error) {
      console.warn("[license] 心跳失败：", error instanceof Error ? error.message : error);
    }
  };
  // 启动后先补一次对账（给重装用户把额度拉回来），之后按 interval 走。
  const kickoff = setTimeout(() => void tick(), 20_000);
  const timer = setInterval(() => void tick(), intervalMs);
  // 不要因为心跳把进程吊住（服务端是常驻进程，但测试/脚本里会跑完退出）。
  kickoff.unref?.();
  timer.unref?.();
  return () => {
    stopped = true;
    clearTimeout(kickoff);
    clearInterval(timer);
  };
}
