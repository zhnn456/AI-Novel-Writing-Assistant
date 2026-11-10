import { AppError } from "../../middleware/errorHandler";
import { getLicenseStatus, type LicenseStatus } from "./licenseService";
import { pullBookUsage, reportBookUsage } from "./bookUsageSync";
import { fetchBookTicket, invalidateBookTicket } from "./bookTicket";
import { isClientIntact } from "./integrity";
import { reportClientEvent } from "./clientEvent";
import {
  readBookUsage,
  readUsage,
  readUsedChapters as readUsedChaptersFromLedger,
  writeUsage,
  type UsageState,
} from "./usageLedger";

/**
 * 授权权限（Entitlement）——决定「能写多少」，而不是「能不能用」。
 *
 * 设计口径（与产品确认一致）：
 *  - 正式授权有效（activated 且未到期）：full，章节生成不限。
 *  - 未激活 / 已到期 / 已被服务端吊销：limited，基础功能全部保留
 *    （开书、设定、大纲、看稿、改稿、导出、素材库），但每本书只允许再生成 3 章。
 *  - 不因断网降级：令牌有效就按 full 处理，不做「离线判盗版」。
 *
 * 额度记账只记「受限模式下新生成的章节」，因此老用户到期时历史稿件不受影响，
 * 每本书仍能再体验 3 章。账本落在数据目录，重装后由服务端心跳对账（P2）纠正。
 */

export const LIMITED_CHAPTER_LIMIT = 3;

export type EntitlementMode = "full" | "limited";
export type EntitlementReason = "active" | "expired" | "inactive";

export interface LicenseEntitlement {
  mode: EntitlementMode;
  reason: EntitlementReason;
  /** 受限模式下每本书可生成章节上限；正式授权为 null（不限）。 */
  chapterLimitPerBook: number | null;
  /** 查询时指定的书；未指定则为 null。 */
  novelId: string | null;
  usedChapters: number | null;
  remainingChapters: number | null;
  planName: string | null;
  expiresAt: string | null;
  /** 程序文件完整性校验失败（被改过）：界面据此提示，功能降级但不锁死。 */
  tampered: boolean;
}

/**
 * 受限模式下的额度拦截错误。带 code，前端据此展示「去激活」而不是普通报错。
 */
export class LicenseLimitError extends AppError {
  readonly code = "LICENSE_CHAPTER_LIMIT";

  constructor(message: string, details?: unknown) {
    super(message, 403, details);
  }
}

function isFullLicense(status: LicenseStatus): boolean {
  // 令牌绑定本机、状态为 active/trialing、且未到期，才算正式授权。
  return status.activated && status.bound && !status.expired;
}

/** 供测试与其它模块复用的判定：令牌有效 = 不限章节。 */
export function isFullLicenseStatus(status: LicenseStatus): boolean {
  return isFullLicense(status);
}

/** 读取某本书在受限模式下已用掉的章数（没有记录返回 0）。 */
export function readUsedChapters(novelId: string): number {
  return readUsedChaptersFromLedger(novelId);
}

function resolveMode(status: LicenseStatus): {
  mode: EntitlementMode;
  reason: EntitlementReason;
  tampered: boolean;
} {
  // 程序文件被改过：一律按体验态走，不管本地授权看起来多"有效"。
  // 不退出、不锁死，只是把"不限章节"收回到每本书 3 章。
  if (!isClientIntact()) {
    return {
      mode: "limited",
      reason: status.expiresAt && status.expired ? "expired" : "inactive",
      tampered: true,
    };
  }
  if (isFullLicense(status)) {
    return { mode: "full", reason: "active", tampered: false };
  }
  if (status.expiresAt && status.expired) {
    return { mode: "limited", reason: "expired", tampered: false };
  }
  return { mode: "limited", reason: "inactive", tampered: false };
}

/** 读取当前授权权限；传 novelId 时同时返回这本书的已用/剩余章数。 */
export async function getEntitlement(novelId?: string | null): Promise<LicenseEntitlement> {
  const status = await getLicenseStatus();
  const { mode, reason, tampered } = resolveMode(status);
  if (mode === "full") {
    return {
      mode,
      reason,
      chapterLimitPerBook: null,
      novelId: novelId ?? null,
      usedChapters: null,
      remainingChapters: null,
      planName: status.planName,
      expiresAt: status.expiresAt,
      tampered,
    };
  }
  if (!novelId) {
    return {
      mode,
      reason,
      chapterLimitPerBook: LIMITED_CHAPTER_LIMIT,
      novelId: null,
      usedChapters: null,
      remainingChapters: null,
      planName: status.planName,
      expiresAt: status.expiresAt,
      tampered,
    };
  }
  // 受限模式下先跟服务端对一次账，展示的是真实剩余章数（拉不到就用本地值）。
  if (novelId) {
    await pullBookUsage();
  }
  const usage = readBookUsage(readUsage(), novelId);
  return {
    mode,
    reason,
    chapterLimitPerBook: LIMITED_CHAPTER_LIMIT,
    novelId,
    usedChapters: usage.used,
    remainingChapters: Math.max(0, LIMITED_CHAPTER_LIMIT - usage.used),
    planName: status.planName,
    expiresAt: status.expiresAt,
    tampered,
  };
}

function messageForReason(reason: EntitlementReason): string {
  if (reason === "expired") {
    return `本书的 ${LIMITED_CHAPTER_LIMIT} 章体验额度已用完，授权已到期。激活后可继续生成，已写的章节仍可正常修改和导出。`;
  }
  return `本书的 ${LIMITED_CHAPTER_LIMIT} 章体验额度已用完。激活后可继续生成，已写的章节仍可正常修改和导出。`;
}

/**
 * 开始一次章节生成：校验额度。
 *
 * 只有真正产出章节后才记 1 章（调用 commit），所以失败、取消、超时都不会白扣。
 * 校验前会先向服务端拉一次真实账本（最多等 3 秒，失败按本地值走），
 * 因此删数据目录重装、或手改本地账本，都拿不回新的 3 章。
 *
 * 返回的 refund 保留给兼容旧调用点：commit 之前调用它等于放弃本次占用（幂等）。
 */
export async function beginChapterGeneration(novelId: string): Promise<{
  commit: () => void;
  refund: () => void;
}> {
  const status = await getLicenseStatus();
  const intact = isClientIntact();
  if (isFullLicense(status) && intact) {
    return { commit: () => undefined, refund: () => undefined };
  }
  if (!intact) {
    reportClientEvent("tamper", "程序文件哈希与发布清单不一致，已降级为体验模式");
  }
  await pullBookUsage();
  // 服务端票据：剩余章数只能由 Keygate 签出来。取不到票（断网/服务端故障）
  // 不拦人，按本地账本走 3 章兜底——「到期不锁死」的口径优先。
  const ticket = await fetchBookTicket(novelId);
  if (!ticket) {
    reportClientEvent("ticket", "获取章节票据失败，按本地账本兜底");
  }
  const ticketUsed = ticket && ticket.mode === "limited" ? ticket.used : undefined;
  if (ticket && ticket.mode === "limited" && ticket.remaining <= 0) {
    throw new LicenseLimitError(messageForReason(status.expiresAt && status.expired ? "expired" : "inactive"), {
      kind: "novelId",
      novelId,
    });
  }
  return beginChapterGenerationWithStatus(status, novelId, ticketUsed, intact);
}

/** 与 beginChapterGeneration 同逻辑，但由调用方提供授权状态（供测试与批处理复用）。 */
export function beginChapterGenerationWithStatus(
  status: LicenseStatus,
  novelId: string,
  serverUsed?: number,
  intact: boolean = true,
): { commit: () => void; refund: () => void } {
  if (isFullLicense(status) && intact) {
    return { commit: () => undefined, refund: () => undefined };
  }
  const reason: EntitlementReason = status.expiresAt && status.expired ? "expired" : "inactive";
  const state = readUsage();
  const usage = readBookUsage(state, novelId);
  // 服务端账本优先：删数据目录 / 改本地文件都拿不回额度。
  const used = typeof serverUsed === "number" ? Math.max(usage.used, serverUsed) : usage.used;
  if (used >= LIMITED_CHAPTER_LIMIT) {
    throw new LicenseLimitError(messageForReason(reason), {
      kind: "novelId",
      novelId,
    });
  }
  let settled = false;
  return {
    commit: () => {
      if (settled) return;
      settled = true;
      const latest = readUsage();
      const entry = readBookUsage(latest, novelId);
      latest.books[novelId] = {
        used: entry.used + 1,
        updatedAt: new Date().toISOString(),
      };
      writeUsage(latest);
      // 下一章要重新取票，剩余章数已经变了。
      invalidateBookTicket();
      void reportBookUsage();
    },
    refund: () => {
      // 改了「成功后才记账」，失败路径本来就没扣，这里只需标记本次占用结束。
      settled = true;
    },
  };
}

/** 整本自动生成（导演 / 流水线）只在正式授权下开放。 */
export async function assertFullEntitlement(): Promise<void> {
  const status = await getLicenseStatus();
  if (isFullLicense(status) && isClientIntact()) {
    return;
  }
  if (!isClientIntact()) {
    reportClientEvent("tamper", "整本自动生成请求来自完整性校验失败的客户端");
  }
  const reason: EntitlementReason = status.expiresAt && status.expired ? "expired" : "inactive";
  throw new LicenseLimitError(
    reason === "expired"
      ? "授权已到期，整本自动生成已暂停。你仍可以单章生成（每本书还可体验 3 章），激活后即可开启自动导演。"
      : "整本自动生成需要正式授权。你可以单章生成（每本书可体验 3 章），激活后即可开启自动导演。",
    { kind: "autoDirector" },
  );
}
