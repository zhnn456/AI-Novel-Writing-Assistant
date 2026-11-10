import { callKeygate, getLicenseIdentity, verifyKeygateSignedPayload } from "./licenseService";

/**
 * 章节生成票据（服务端短票据）。
 *
 * 本地账本和本地 3 章上限都是可以被改的——它们只是 JS 里的常量。
 * 票据的作用不是让本地判断变得不可绕过（绕过仍然可以：删掉调用就行），
 * 而是让「剩余几章」这个数字只能由 Keygate 用自己的私钥签出来：
 * 攻击者即使把本地上限改成 99999，也伪造不出一个 remaining=99999 且签名正确的票据。
 *
 * 规则：
 *  - 60 秒有效期，客户端缓存 40 秒（一次生成最多取一次票）。
 *  - 取不到票（断网/服务端故障）不拦人：按本地账本走 3 章兜底，保持「到期不锁死」的口径。
 *  - 票据里的 did/nid 与本机/当前书不符 → 视为无效，按本地兜底。
 */

interface TicketPayload {
  lid?: unknown;
  did?: unknown;
  nid?: unknown;
  mod?: unknown;
  rem?: unknown;
  used?: unknown;
  exp?: unknown;
  nce?: unknown;
}

export interface BookTicket {
  mode: "full" | "limited";
  /** full 为 -1（不限），limited 为剩余章数（可能为 0）。 */
  remaining: number;
  used: number;
  expiresAt: number;
  nonce: string;
}

const TICKET_TIMEOUT_MS = 3_000;
const TICKET_CACHE_MS = 40_000;

let cached: { novelId: string; at: number; ticket: BookTicket } | null = null;

function normalize(raw: unknown, novelId: string, fingerprint: string): BookTicket | null {
  if (typeof raw !== "string" || !raw) return null;
  const payload = verifyKeygateSignedPayload<TicketPayload>(raw);
  if (!payload) return null;
  if (typeof payload.did !== "string" || payload.did !== fingerprint) return null;
  if (typeof payload.nid !== "string" || payload.nid !== novelId) return null;
  if (payload.mod !== "full" && payload.mod !== "limited") return null;
  const remaining = typeof payload.rem === "number" ? payload.rem : Number(payload.rem);
  const used = typeof payload.used === "number" ? payload.used : Number(payload.used);
  if (!Number.isFinite(remaining) || !Number.isFinite(used)) return null;
  const expiresAt = typeof payload.exp === "number" ? payload.exp : 0;
  const nonce = typeof payload.nce === "string" ? payload.nce : "";
  return { mode: payload.mod, remaining, used, expiresAt, nonce };
}

/**
 * 取一张票据。失败返回 null，调用方必须把它当成「用本地账本兜底」，不是违规。
 */
export async function fetchBookTicket(novelId: string, force = false): Promise<BookTicket | null> {
  const identity = getLicenseIdentity();
  if (!identity) return null;
  if (!force && cached && cached.novelId === novelId && Date.now() - cached.at < TICKET_CACHE_MS) {
    return cached.ticket;
  }
  try {
    const { data } = await withTimeout(
      callKeygate("/api/v1/license/books/ticket", {
        license_key: identity.licenseKey,
        identifier: identity.fingerprint,
        novel_id: novelId,
      }),
      TICKET_TIMEOUT_MS,
    );
    const ticket = normalize(data.ticket, novelId, identity.fingerprint);
    if (!ticket) {
      console.warn("[license] 票据验签失败，回退本地账本");
      return null;
    }
    cached = { novelId, at: Date.now(), ticket };
    return ticket;
  } catch (error) {
    console.warn("[license] 获取章节票据失败，回退本地账本：", error instanceof Error ? error.message : error);
    return null;
  }
}

/** 生成成功后清掉缓存，下一章重新取票（剩余章数会变）。 */
export function invalidateBookTicket(): void {
  cached = null;
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
