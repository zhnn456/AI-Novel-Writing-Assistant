import fs from "node:fs";
import path from "node:path";
import { resolveDataRoot } from "../../runtime/appPaths";

/**
 * 体验额度账本（本地副本）。
 *
 * 服务端（Keygate 的 book_usage 表）才是权威值；这里只是为了让「生成前判断」
 * 不依赖网络、不拖慢生成。启动、心跳和每次受限模式生成之前，会用服务端值覆盖
 * 这份副本，所以删数据目录重装也拿不回新的 3 章。
 */

export const USAGE_FILE_NAME = "license-usage.json";

export interface BookUsageEntry {
  used: number;
  updatedAt: string;
}

export interface UsageState {
  schema: 1;
  books: Record<string, BookUsageEntry>;
}

export function resolveUsagePath(): string {
  return path.join(resolveDataRoot(), USAGE_FILE_NAME);
}

export function readUsage(): UsageState {
  try {
    const raw = fs.readFileSync(resolveUsagePath(), "utf8");
    const parsed = JSON.parse(raw) as UsageState;
    if (parsed && parsed.schema === 1 && parsed.books && typeof parsed.books === "object") {
      return parsed;
    }
  } catch {
    // 首次运行、文件损坏、权限异常：都当作空账本，不阻塞用户写作。
  }
  return { schema: 1, books: {} };
}

export function writeUsage(state: UsageState): void {
  const filePath = resolveUsagePath();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), { encoding: "utf8" });
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    console.warn("[license] 写入体验额度账本失败：", error);
  }
}

export function readBookUsage(state: UsageState, novelId: string): BookUsageEntry {
  const entry = state.books[novelId];
  if (!entry || typeof entry.used !== "number" || entry.used < 0) {
    return { used: 0, updatedAt: "" };
  }
  return entry;
}

/** 读取某本书已用掉的章数（没有记录返回 0）。 */
export function readUsedChapters(novelId: string): number {
  return readBookUsage(readUsage(), novelId).used;
}

/** 本地账本里的全部书（按已用章数倒序），供上报使用。 */
export function listBooks(): Array<{ novelId: string; used: number }> {
  const state = readUsage();
  return Object.entries(state.books)
    .filter(([, entry]) => entry && typeof entry.used === "number" && entry.used >= 0)
    .map(([novelId, entry]) => ({ novelId, used: entry.used }))
    .sort((a, b) => b.used - a.used);
}

/**
 * 用服务端返回的账本覆盖本地：服务端有的书以服务端为准（服务端只增不减），
 * 服务端没有的书保留本地值，避免因为一次同步把还没上报的记录抹掉。
 */
export function mergeFromServer(entries: Array<{ novelId: string; used: number; updatedAt?: string }>): void {
  const state = readUsage();
  let changed = false;
  for (const entry of entries) {
    if (!entry.novelId || typeof entry.used !== "number" || entry.used < 0) continue;
    const current = readBookUsage(state, entry.novelId);
    if (entry.used > current.used || !state.books[entry.novelId]) {
      state.books[entry.novelId] = {
        used: entry.used,
        updatedAt: entry.updatedAt || new Date().toISOString(),
      };
      changed = true;
    }
  }
  if (changed) {
    writeUsage(state);
  }
}
