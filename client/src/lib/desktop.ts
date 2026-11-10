import { useEffect, useState } from "react";
import { APP_RUNTIME } from "./constants";

export type DesktopBootstrapState = "launching" | "starting-server" | "loading-ui" | "ready" | "error";
export type DesktopUpdaterStatus =
  | "disabled"
  | "idle"
  | "checking"
  | "update-available"
  | "downloading"
  | "downloaded"
  | "not-available"
  | "error";

export interface DesktopBootstrapSnapshot {
  state: DesktopBootstrapState;
  stage: string;
  title: string;
  detail: string;
  logDir: string;
  logFile: string;
  updatedAt: string;
  canRetry: boolean;
}

export interface DesktopUpdaterSnapshot {
  status: DesktopUpdaterStatus;
  message: string;
  currentVersion: string;
  availableVersion: string | null;
  progressPercent: number | null;
  bytesPerSecond: number | null;
  channel: string;
  isPortable: boolean;
  isPackaged: boolean;
  isSupported: boolean;
  canInstall: boolean;
  releaseNotes: string | null;
  updatedAt: string;
  lastCheckedAt: string | null;
}

export interface DesktopDataImportSnapshot {
  currentDatabasePath: string;
  currentDatabaseLikelyFresh: boolean;
  suggestedSourcePath: string | null;
  suggestedSourceLabel: string | null;
  backupDirectory: string;
}

export interface DesktopDataImportResult {
  scheduled: boolean;
  cancelled: boolean;
  sourcePath?: string;
}

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

const DEFAULT_BOOTSTRAP_SNAPSHOT: DesktopBootstrapSnapshot = {
  state: "launching",
  stage: "launching",
  title: "正在启动桌面工作区",
  detail: "正在准备桌面本地运行时。",
  logDir: "",
  logFile: "",
  updatedAt: "",
  canRetry: false,
};

const DEFAULT_UPDATER_SNAPSHOT: DesktopUpdaterSnapshot = {
  status: "disabled",
  message: "当前运行环境无法使用桌面版更新。",
  currentVersion: "0.0.0",
  availableVersion: null,
  progressPercent: null,
  bytesPerSecond: null,
  channel: "beta",
  isPortable: false,
  isPackaged: false,
  isSupported: false,
  canInstall: false,
  releaseNotes: null,
  updatedAt: "",
  lastCheckedAt: null,
};

function getDesktopBridge() {
  if (typeof window === "undefined" || APP_RUNTIME !== "desktop") {
    return null;
  }

  return window.__AI_NOVEL_DESKTOP__ ?? null;
}

export function notifyDesktopRendererReady(): void {
  getDesktopBridge()?.notifyRendererReady?.();
}

export function notifyDesktopAppShellReady(): void {
  getDesktopBridge()?.notifyAppShellReady?.();
}

// 当前版本对应的更新说明：由主进程按「国内主源 → 香港备用源」顺序读取最新清单里的
// releaseNotes，只有清单版本与本机版本一致时才返回，避免把别的版本内容当成本版。
export async function fetchCurrentReleaseNotes(): Promise<string | null> {
  const notes = await getDesktopBridge()?.getReleaseNotes?.();
  return typeof notes === "string" && notes.trim().length > 0 ? notes.trim() : null;
}

export async function checkForDesktopUpdates(): Promise<void> {
  await getDesktopBridge()?.checkForUpdates?.();
}

export async function downloadDesktopUpdate(): Promise<void> {
  await getDesktopBridge()?.downloadUpdate?.();
}

export async function quitAndInstallDesktopUpdate(): Promise<void> {
  await getDesktopBridge()?.quitAndInstall?.();
}

export async function openDesktopLogsDirectory(): Promise<void> {
  await getDesktopBridge()?.openLogsDirectory?.();
}

/** 用系统默认浏览器打开外部链接（领取试用、购买入口等）。 */
export async function openDesktopExternal(url: string): Promise<void> {
  const bridge = getDesktopBridge();
  if (bridge?.openExternal) {
    await bridge.openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function copyDesktopLogPath(): Promise<string | undefined> {
  return getDesktopBridge()?.copyLogPath?.();
}

export async function bundleDesktopLogs(): Promise<string | null> {
  return getDesktopBridge()?.bundleLogs?.() ?? null;
}

export async function restartDesktopApp(): Promise<void> {
  await getDesktopBridge()?.restartApp?.();
}

export async function getDesktopDataImportSnapshot(): Promise<DesktopDataImportSnapshot | null> {
  return getDesktopBridge()?.getDataImportSnapshot?.() ?? null;
}

export async function importDesktopLegacyDatabase(options?: { preferSuggested?: boolean }): Promise<DesktopDataImportResult | null> {
  return getDesktopBridge()?.importLegacyDatabase?.(options) ?? null;
}

export async function refreshDesktopNotice(): Promise<DesktopNoticeSnapshot | null> {
  const result = await getDesktopBridge()?.refreshNotice?.();
  return (result as DesktopNoticeSnapshot | null | undefined) ?? null;
}

export async function interactWithDesktopNotice(
  noticeId: string,
  action: DesktopNoticeAction,
): Promise<DesktopNoticeSnapshot | null> {
  const result = await getDesktopBridge()?.interactWithNotice?.({ id: noticeId, action });
  return (result as DesktopNoticeSnapshot | null | undefined) ?? null;
}

export function useDesktopBootstrap(): DesktopBootstrapSnapshot {
  const [snapshot, setSnapshot] = useState<DesktopBootstrapSnapshot>(DEFAULT_BOOTSTRAP_SNAPSHOT);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge?.getBootstrapSnapshot) {
      return undefined;
    }

    let cancelled = false;

    void bridge.getBootstrapSnapshot().then((nextSnapshot) => {
      if (!cancelled && nextSnapshot) {
        setSnapshot(nextSnapshot);
      }
    });

    const unsubscribe = bridge.subscribeBootstrapState?.((nextSnapshot) => {
      if (!cancelled && nextSnapshot) {
        setSnapshot(nextSnapshot);
      }
    });

    return () => {
      cancelled = true;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  return snapshot;
}

export function useDesktopUpdater(): DesktopUpdaterSnapshot {
  const [snapshot, setSnapshot] = useState<DesktopUpdaterSnapshot>(DEFAULT_UPDATER_SNAPSHOT);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge?.getUpdaterSnapshot) {
      return undefined;
    }

    let cancelled = false;

    void bridge.getUpdaterSnapshot().then((nextSnapshot) => {
      if (!cancelled && nextSnapshot) {
        setSnapshot(nextSnapshot);
      }
    });

    const unsubscribe = bridge.subscribeUpdaterStatus?.((nextSnapshot) => {
      if (!cancelled && nextSnapshot) {
        setSnapshot(nextSnapshot);
      }
    });

    return () => {
      cancelled = true;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  return snapshot;
}

const DEFAULT_NOTICE_SNAPSHOT: DesktopNoticeSnapshot = {
  status: "disabled",
  notice: null,
  message: "运营弹窗只在桌面版可用。",
  updatedAt: "",
  lastCheckedAt: null,
  sourceUrl: "",
};

export function useDesktopNotice(): DesktopNoticeSnapshot {
  const [snapshot, setSnapshot] = useState<DesktopNoticeSnapshot>(DEFAULT_NOTICE_SNAPSHOT);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge?.getNoticeSnapshot) {
      return undefined;
    }

    let cancelled = false;

    void bridge.getNoticeSnapshot().then((nextSnapshot) => {
      if (!cancelled && nextSnapshot) {
        setSnapshot(nextSnapshot as DesktopNoticeSnapshot);
      }
    });

    const unsubscribe = bridge.subscribeNoticeState?.((nextSnapshot) => {
      if (!cancelled && nextSnapshot) {
        setSnapshot(nextSnapshot as DesktopNoticeSnapshot);
      }
    });

    return () => {
      cancelled = true;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  return snapshot;
}
