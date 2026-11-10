import fs from "node:fs";
import path from "node:path";
import { appendDesktopLog, logDesktopError } from "./logging";
import { resolveDesktopAppDataDir } from "./paths";
import { SnapshotStore } from "./state";

// 运营弹窗：内容与客户端版本解耦，放在与更新源同域的静态文件里，
// 换一份文件即可上线或下架，不需要重新打包、不需要用户升级。
const DEFAULT_NOTICE_URL = "https://keygate.de5.net/whale/files/notice.json";
const FETCH_TIMEOUT_MS = 5_000;
const NOTICE_DIR = "notice";
const CACHE_FILE = "cache.json";
const STATE_FILE = "state.json";
const SCHEMA_VERSION = 1;

export type DesktopNoticeLevel = "P0" | "P1" | "P2" | "P3" | "P4";
export type DesktopNoticeType = "maintenance" | "license" | "update" | "promo" | "tips";
export type DesktopNoticePlacement = "modal" | "banner" | "corner";
export type DesktopNoticeAction = "close" | "check-update" | "open-url" | "open-feedback";

export interface DesktopNoticeButton {
  text: string;
  action: DesktopNoticeAction;
  url?: string;
}

export interface DesktopNoticeItem {
  id: string;
  level: DesktopNoticeLevel;
  type: DesktopNoticeType;
  placement: DesktopNoticePlacement;
  title: string;
  summary: string;
  body?: string;
  buttons: DesktopNoticeButton[];
  startAt: string;
  endAt: string;
  channels: string[];
  minVersion: string;
  maxVersion: string;
  oncePerVersion: boolean;
  maxPerDay: number;
  dismissDays: number;
}

export interface DesktopNoticeSnapshot {
  status: "disabled" | "idle" | "loading" | "ready" | "offline" | "error";
  notice: DesktopNoticeItem | null;
  message: string;
  updatedAt: string;
  lastCheckedAt: string | null;
  sourceUrl: string;
}

interface NoticePayload {
  schema: number;
  updatedAt?: string;
  items: unknown[];
}

interface NoticeStateFile {
  dismissed: Record<string, string>;
  shownByVersion: Record<string, string>;
  shownByDay: Record<string, { count: number; date: string }>;
  lastModalAt: Record<string, string>;
  promoMonth: { month: string; count: number };
}

// 克制原则：运营类内容（活动、小提示）每个自然月最多露两条，
// 且永远不占用居中模态，避免为了曝光反复打断写作。
const MONTHLY_PROMO_LIMIT = 2;

const LEVEL_ORDER: Record<DesktopNoticeLevel, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
};

const ALLOWED_ACTIONS: DesktopNoticeAction[] = ["close", "check-update", "open-url", "open-feedback"];
const ALLOWED_LEVELS: DesktopNoticeLevel[] = ["P0", "P1", "P2", "P3", "P4"];
const ALLOWED_TYPES: DesktopNoticeType[] = ["maintenance", "license", "update", "promo", "tips"];
const ALLOWED_PLACEMENTS: DesktopNoticePlacement[] = ["modal", "banner", "corner"];

function nowIso(): string {
  return new Date().toISOString();
}

function todayKey(now = new Date()): string {
  const offsetMs = now.getTime() + 8 * 60 * 60 * 1000;
  return new Date(offsetMs).toISOString().slice(0, 10);
}

function resolveNoticeUrl(): string {
  return process.env.AI_NOVEL_NOTICE_URL?.trim() || DEFAULT_NOTICE_URL;
}

function resolveNoticeDir(): string {
  return path.join(resolveDesktopAppDataDir(), NOTICE_DIR);
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch (error) {
    logDesktopError("desktop.notice.read", error);
    return null;
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
  } catch (error) {
    logDesktopError("desktop.notice.write", error);
  }
}

function emptyState(): NoticeStateFile {
  return { dismissed: {}, shownByVersion: {}, shownByDay: {}, lastModalAt: {}, promoMonth: { month: "", count: 0 } };
}

function monthKey(now = new Date()): string {
  return todayKey(now).slice(0, 7);
}

function isPromoLike(item: DesktopNoticeItem): boolean {
  return item.type === "promo" || item.type === "tips" || item.level === "P3" || item.level === "P4";
}

function compareVersions(left: string, right: string): number {
  const parse = (value: string): number[] =>
    value
      .trim()
      .replace(/^v/i, "")
      .split("-")[0]
      .split(".")
      .map((part) => {
        const parsed = Number.parseInt(part, 10);
        return Number.isFinite(parsed) ? parsed : 0;
      });

  const a = parse(left);
  const b = parse(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) {
      return diff > 0 ? 1 : -1;
    }
  }
  return 0;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseButtons(value: unknown): DesktopNoticeButton[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const text = asString(record.text);
      const action = asString(record.action) as DesktopNoticeAction;
      if (!text || !ALLOWED_ACTIONS.includes(action)) {
        return null;
      }
      const url = asString(record.url);
      return { text, action, url: url || undefined } as DesktopNoticeButton;
    })
    .filter((entry): entry is DesktopNoticeButton => entry !== null)
    .slice(0, 2);
}

// 内容一律视为不可信外部输入：逐字段校验，任何一项不合法就整条丢弃，
// 避免一条坏数据把客户端弹窗卡死或渲染出奇怪的界面。
function parseNoticeItem(value: unknown): DesktopNoticeItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = asString(record.id);
  const title = asString(record.title);
  const summary = asString(record.summary);
  const level = asString(record.level).toUpperCase() as DesktopNoticeLevel;
  const type = asString(record.type).toLowerCase() as DesktopNoticeType;
  const placementRaw = asString(record.placement).toLowerCase();
  const placement = (placementRaw || "modal") as DesktopNoticePlacement;
  const startAt = asString(record.startAt);
  const endAt = asString(record.endAt);

  if (!id || !title || !summary) {
    return null;
  }
  if (!ALLOWED_LEVELS.includes(level) || !ALLOWED_TYPES.includes(type) || !ALLOWED_PLACEMENTS.includes(placement)) {
    return null;
  }

  const startMs = Date.parse(startAt);
  const endMs = Date.parse(endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    return null;
  }

  const channels = Array.isArray(record.channels)
    ? record.channels.map((channel) => asString(channel).toLowerCase()).filter(Boolean)
    : ["beta"];

  return {
    id,
    level,
    type,
    placement,
    title,
    summary,
    body: asString(record.body) || undefined,
    buttons: parseButtons(record.buttons),
    startAt,
    endAt,
    channels,
    minVersion: asString(record.minVersion),
    maxVersion: asString(record.maxVersion),
    oncePerVersion: asBoolean(record.oncePerVersion, false),
    maxPerDay: Math.max(1, asNumber(record.maxPerDay, 1)),
    dismissDays: Math.max(0, asNumber(record.dismissDays, 14)),
  };
}

function parsePayload(raw: unknown): DesktopNoticeItem[] | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const payload = raw as Record<string, unknown>;
  if (asNumber(payload.schema, 0) !== SCHEMA_VERSION) {
    return null;
  }
  if (!Array.isArray(payload.items)) {
    return null;
  }
  return payload.items
    .map((item) => parseNoticeItem(item))
    .filter((item): item is DesktopNoticeItem => item !== null);
}

export interface DesktopNoticeController {
  getSnapshot: () => DesktopNoticeSnapshot;
  subscribe: (listener: (snapshot: DesktopNoticeSnapshot) => void) => () => void;
  refresh: () => Promise<DesktopNoticeSnapshot>;
  scheduleInitialFetch: (delayMs?: number) => void;
  interact: (noticeId: string, action: DesktopNoticeAction) => DesktopNoticeSnapshot;
}

interface DesktopNoticeOptions {
  currentVersion: string;
  updateChannel: string;
  isPackaged: boolean;
  onAction?: (action: DesktopNoticeAction, button: DesktopNoticeButton | null) => void;
}

export function initializeDesktopNotice(options: DesktopNoticeOptions): DesktopNoticeController {
  const sourceUrl = resolveNoticeUrl();
  const disabled = process.env.AI_NOVEL_DESKTOP_DISABLE_NOTICE?.trim() === "true";

  const store = new SnapshotStore<DesktopNoticeSnapshot>({
    status: disabled ? "disabled" : "idle",
    notice: null,
    message: disabled ? "运营弹窗已在当前运行环境中关闭。" : "尚未获取运营内容。",
    updatedAt: nowIso(),
    lastCheckedAt: null,
    sourceUrl,
  });

  const statePath = path.join(resolveNoticeDir(), STATE_FILE);
  const cachePath = path.join(resolveNoticeDir(), CACHE_FILE);

  function loadState(): NoticeStateFile {
    const raw = readJsonFile<Partial<NoticeStateFile>>(statePath);
    return {
      dismissed: raw?.dismissed && typeof raw.dismissed === "object" ? raw.dismissed : {},
      shownByVersion: raw?.shownByVersion && typeof raw.shownByVersion === "object" ? raw.shownByVersion : {},
      shownByDay: raw?.shownByDay && typeof raw.shownByDay === "object" ? raw.shownByDay : {},
      lastModalAt: raw?.lastModalAt && typeof raw.lastModalAt === "object" ? raw.lastModalAt : {},
      promoMonth:
        raw?.promoMonth && typeof raw.promoMonth === "object" && typeof raw.promoMonth.month === "string"
          ? { month: raw.promoMonth.month, count: Number(raw.promoMonth.count) || 0 }
          : { month: "", count: 0 },
    };
  }

  function saveState(state: NoticeStateFile): void {
    writeJsonFile(statePath, state);
  }

  function isEligible(item: DesktopNoticeItem, now: Date, state: NoticeStateFile): boolean {
    if (!item.channels.includes(options.updateChannel.toLowerCase())) {
      return false;
    }

    if (options.currentVersion !== "0.0.0") {
      if (item.minVersion && compareVersions(options.currentVersion, item.minVersion) < 0) {
        return false;
      }
      if (item.maxVersion && compareVersions(options.currentVersion, item.maxVersion) > 0) {
        return false;
      }
    }

    const nowMs = now.getTime();
    if (nowMs < Date.parse(item.startAt) || nowMs > Date.parse(item.endAt)) {
      return false;
    }

    const dismissedAt = state.dismissed[item.id];
    if (dismissedAt && item.dismissDays > 0) {
      const elapsed = nowMs - Date.parse(dismissedAt);
      if (Number.isFinite(elapsed) && elapsed < item.dismissDays * 24 * 60 * 60 * 1000) {
        return false;
      }
    }

    if (item.oncePerVersion && state.shownByVersion[item.id] === options.currentVersion) {
      return false;
    }

    const day = todayKey(now);
    const dayEntry = state.shownByDay[item.id];
    const countToday = dayEntry && dayEntry.date === day ? dayEntry.count : 0;
    if (countToday >= item.maxPerDay) {
      return false;
    }

    // 同一时刻只让一条模态出现：非紧急内容每天最多占用一次模态额度。
    if (item.placement === "modal" && item.level !== "P0" && item.level !== "P1") {
      const lastModal = state.lastModalAt.global;
      if (lastModal && todayKey(new Date(lastModal)) === day) {
        return false;
      }
    }

    // 运营类整体限额：一个自然月最多两条，宁可少发也不刷存在感。
    if (isPromoLike(item)) {
      const month = monthKey(now);
      const promoCount = state.promoMonth?.month === month ? state.promoMonth.count : 0;
      if (promoCount >= MONTHLY_PROMO_LIMIT) {
        return false;
      }
    }

    return true;
  }

  function selectNotice(items: DesktopNoticeItem[]): DesktopNoticeItem | null {
    const now = new Date();
    const state = loadState();
    const eligible = items.filter((item) => isEligible(item, now, state));
    if (eligible.length === 0) {
      return null;
    }

    return eligible
      .slice()
      .sort((left, right) => {
        const byLevel = LEVEL_ORDER[left.level] - LEVEL_ORDER[right.level];
        if (byLevel !== 0) {
          return byLevel;
        }
        return Date.parse(right.startAt) - Date.parse(left.startAt);
      })[0];
  }

  function publish(partial: Partial<DesktopNoticeSnapshot>): DesktopNoticeSnapshot {
    const next: DesktopNoticeSnapshot = {
      ...store.getSnapshot(),
      ...partial,
      updatedAt: nowIso(),
    };
    store.setSnapshot(next);
    return next;
  }

  function readCache(): DesktopNoticeItem[] | null {
    const raw = readJsonFile<NoticePayload>(cachePath);
    return parsePayload(raw);
  }

  async function refresh(): Promise<DesktopNoticeSnapshot> {
    if (disabled) {
      return store.getSnapshot();
    }

    publish({ status: "loading", message: "正在获取运营内容。" });

    let items: DesktopNoticeItem[] | null = null;
    let lastCheckedAt: string | null = null;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const response = await fetch(sourceUrl, {
          signal: controller.signal,
          headers: { accept: "application/json" },
          cache: "no-store",
        });
        if (response.ok) {
          const payload = (await response.json()) as NoticePayload;
          items = parsePayload(payload);
          if (items) {
            writeJsonFile(cachePath, payload);
            lastCheckedAt = nowIso();
          } else {
            appendDesktopLog("desktop.notice.parse", `Ignored invalid notice payload from ${sourceUrl}`, "warn");
          }
        } else {
          appendDesktopLog("desktop.notice.fetch", `Notice request returned ${response.status}`, "warn");
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      appendDesktopLog("desktop.notice.fetch", `Notice request failed: ${String(error)}`, "warn");
    }

    const usedCache = items === null;
    if (usedCache) {
      items = readCache();
    }

    if (!items) {
      return publish({
        status: usedCache ? "offline" : "ready",
        notice: null,
        message: usedCache ? "无法获取运营内容，本地也没有可用缓存。" : "当前没有需要展示的运营内容。",
        lastCheckedAt,
      });
    }

    const notice = selectNotice(items);
    return publish({
      status: usedCache ? "offline" : "ready",
      notice,
      message: notice ? `已选中 ${notice.level} 内容：${notice.title}` : "当前没有需要展示的运营内容。",
      lastCheckedAt,
    });
  }

  function scheduleInitialFetch(delayMs = 3_000): void {
    if (disabled) {
      return;
    }
    const timer = setTimeout(() => {
      void refresh().catch((error) => {
        logDesktopError("desktop.notice.schedule", error);
      });
    }, delayMs);
    timer.unref();
  }

  function interact(noticeId: string, action: DesktopNoticeAction): DesktopNoticeSnapshot {
    const snapshot = store.getSnapshot();
    const notice = snapshot.notice;
    if (!notice || notice.id !== noticeId) {
      return snapshot;
    }

    const state = loadState();
    const day = todayKey();
    const dayEntry = state.shownByDay[notice.id];
    state.shownByDay[notice.id] = {
      date: day,
      count: dayEntry && dayEntry.date === day ? dayEntry.count + 1 : 1,
    };
    state.shownByVersion[notice.id] = options.currentVersion;
    state.dismissed[notice.id] = nowIso();
    if (notice.placement === "modal") {
      state.lastModalAt.global = nowIso();
    }
    if (isPromoLike(notice)) {
      const month = monthKey();
      state.promoMonth = {
        month,
        count: state.promoMonth?.month === month ? state.promoMonth.count + 1 : 1,
      };
    }
    saveState(state);

    const button = notice.buttons.find((entry) => entry.action === action) ?? null;
    try {
      options.onAction?.(action, button);
    } catch (error) {
      logDesktopError("desktop.notice.action", error);
    }

    // close 与任何副作用动作都视为本条已完成，避免同一会话里反复打扰。
    return publish({ notice: null, message: "本条运营内容已处理。" });
  }

  return {
    getSnapshot: () => store.getSnapshot(),
    subscribe: (listener) => store.subscribe(listener),
    refresh,
    scheduleInitialFetch,
    interact,
  };
}

export function emptyNoticeState(): NoticeStateFile {
  return emptyState();
}
