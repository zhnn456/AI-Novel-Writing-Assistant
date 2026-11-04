import fs from "node:fs";
import path from "node:path";
import { autoUpdater } from "electron-updater";
import { appendDesktopLog, logDesktopError } from "./logging";
import { createUpdaterSnapshot, desktopUpdaterStore } from "./state";

export interface DesktopUpdaterController {
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  quitAndInstall: () => void;
  scheduleInitialCheck: (delayMs?: number) => void;
}

interface DesktopUpdaterOptions {
  currentVersion: string;
  updateChannel: string;
  isPackaged: boolean;
  isPortable: boolean;
}

function markUpdaterSnapshot(snapshot: ReturnType<typeof createUpdaterSnapshot>): void {
  desktopUpdaterStore.setSnapshot(snapshot);
}

function isUpdaterSupported(options: DesktopUpdaterOptions): boolean {
  if (!options.isPackaged) {
    return false;
  }

  if (options.isPortable) {
    return false;
  }

  return process.env.AI_NOVEL_DESKTOP_DISABLE_UPDATER?.trim() !== "true";
}

function hasPackagedUpdateFeedConfig(): boolean {
  return fs.existsSync(path.join(process.resourcesPath, "app-update.yml"));
}

// 把 electron-updater 的 UpdateInfo.releaseNotes（latest.yml 顶层 releaseNotes，
// 可能是字符串或 {version, note}[] 数组）转成可展示的字符串，按行分行。
function formatReleaseNotes(releaseNotes: unknown): string | null {
  if (typeof releaseNotes === "string") {
    const trimmed = releaseNotes.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(releaseNotes)) {
    const parts = releaseNotes
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          const note = (item as { note?: unknown }).note;
          if (typeof note === "string") return note.trim();
        }
        return "";
      })
      .filter((part) => part.length > 0);
    return parts.length > 0 ? parts.join("\n") : null;
  }
  return null;
}

export function initializeDesktopUpdater(options: DesktopUpdaterOptions): DesktopUpdaterController {
  const supported = isUpdaterSupported(options);
  const hasFeedConfig = !supported || hasPackagedUpdateFeedConfig();
  const unsupportedReason = !options.isPackaged
    ? "开发环境不下载安装包，请在正式安装版中检查更新。"
    : options.isPortable
      ? "便携版需要下载新版安装包后手动替换。"
      : !hasFeedConfig
        ? "此安装包未配置版本更新通道。"
        : "桌面版更新已被运行环境关闭。";

  markUpdaterSnapshot(createUpdaterSnapshot({
    status: supported && hasFeedConfig ? "idle" : "disabled",
    message: supported
      ? hasFeedConfig
        ? "可以检查桌面版更新。"
        : unsupportedReason
      : unsupportedReason,
    currentVersion: options.currentVersion,
    availableVersion: null,
    progressPercent: null,
    bytesPerSecond: null,
    channel: options.updateChannel,
    isPortable: options.isPortable,
    isPackaged: options.isPackaged,
    isSupported: supported && hasFeedConfig,
    canInstall: false,
    releaseNotes: null,
    lastCheckedAt: null,
  }));

  if (!supported || !hasFeedConfig) {
    return {
      async checkForUpdates() {
        return undefined;
      },
      async downloadUpdate() {
        return undefined;
      },
      quitAndInstall() {
        return undefined;
      },
      scheduleInitialCheck() {
        return undefined;
      },
    };
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = options.updateChannel === "beta";

  autoUpdater.on("checking-for-update", () => {
    appendDesktopLog("desktop.updater", "Checking GitHub Releases for desktop updates.");
    markUpdaterSnapshot(createUpdaterSnapshot({
      ...desktopUpdaterStore.getSnapshot(),
      status: "checking",
      message: "正在检查桌面版更新。",
      canInstall: false,
      lastCheckedAt: new Date().toISOString(),
      progressPercent: null,
      bytesPerSecond: null,
    }));
  });

  autoUpdater.on("update-available", (info) => {
    appendDesktopLog("desktop.updater", `Update ${info.version} is available and waiting for download approval.`);
    markUpdaterSnapshot(createUpdaterSnapshot({
      ...desktopUpdaterStore.getSnapshot(),
      status: "update-available",
      message: `桌面版 v${info.version} 可用，由你确认后开始下载。`,
      availableVersion: info.version,
      canInstall: false,
      releaseNotes: formatReleaseNotes(info.releaseNotes),
      progressPercent: null,
      bytesPerSecond: null,
      lastCheckedAt: new Date().toISOString(),
    }));
  });

  autoUpdater.on("update-not-available", () => {
    appendDesktopLog("desktop.updater", "No newer desktop build is available.");
    markUpdaterSnapshot(createUpdaterSnapshot({
      ...desktopUpdaterStore.getSnapshot(),
      status: "not-available",
      message: "当前安装包符合此更新通道的最新版本。",
      availableVersion: null,
      canInstall: false,
      progressPercent: null,
      bytesPerSecond: null,
      lastCheckedAt: new Date().toISOString(),
    }));
  });

  autoUpdater.on("download-progress", (progress) => {
    markUpdaterSnapshot(createUpdaterSnapshot({
      ...desktopUpdaterStore.getSnapshot(),
      status: "downloading",
      message: "正在下载桌面版更新。",
      progressPercent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      canInstall: false,
    }));
  });

  autoUpdater.on("update-downloaded", (info) => {
    appendDesktopLog("desktop.updater", `Update ${info.version} finished downloading and is ready to install.`);
    markUpdaterSnapshot(createUpdaterSnapshot({
      ...desktopUpdaterStore.getSnapshot(),
      status: "downloaded",
      message: `桌面版 v${info.version} 准备完成，重启应用后安装。`,
      availableVersion: info.version,
      canInstall: true,
      releaseNotes: formatReleaseNotes(info.releaseNotes),
      progressPercent: 100,
      bytesPerSecond: null,
      lastCheckedAt: new Date().toISOString(),
    }));
  });

  autoUpdater.on("error", (error) => {
    logDesktopError("desktop.updater", error);
    markUpdaterSnapshot(createUpdaterSnapshot({
      ...desktopUpdaterStore.getSnapshot(),
      status: "error",
      message: "未能完成版本检查，请确认网络连接后重试。",
      canInstall: false,
      progressPercent: null,
      bytesPerSecond: null,
      lastCheckedAt: new Date().toISOString(),
    }));
  });

  const checkForUpdates = async (): Promise<void> => {
    try {
      const snapshot = desktopUpdaterStore.getSnapshot();
      if (snapshot.status === "checking" || snapshot.status === "downloading" || snapshot.status === "downloaded") {
        return;
      }

      if (snapshot.status === "update-available") {
        // 已检测到新版本：保持"待用户确认"状态，绝不自动下载。
        return;
      }

      await autoUpdater.checkForUpdates();
    } catch (error) {
      logDesktopError("desktop.updater", error);
      throw error;
    }
  };

  const downloadUpdate = async (): Promise<void> => {
    try {
      const snapshot = desktopUpdaterStore.getSnapshot();
      if (snapshot.status === "downloading" || snapshot.status === "downloaded") {
        return;
      }
      if (snapshot.status !== "update-available" || !snapshot.availableVersion) {
        appendDesktopLog("desktop.updater", "No approved update to download.");
        return;
      }
      appendDesktopLog("desktop.updater", `Downloading approved update ${snapshot.availableVersion}.`);
      markUpdaterSnapshot(createUpdaterSnapshot({
        ...snapshot,
        status: "downloading",
        message: "正在下载桌面版更新。",
        canInstall: false,
        progressPercent: 0,
        bytesPerSecond: null,
        lastCheckedAt: new Date().toISOString(),
      }));
      await autoUpdater.downloadUpdate();
    } catch (error) {
      logDesktopError("desktop.updater", error);
      throw error;
    }
  };

  const scheduleInitialCheck = (delayMs = 1_000): void => {
    const timer = setTimeout(() => {
      void checkForUpdates().catch((error) => {
        logDesktopError("desktop.updater.schedule", error);
      });
    }, delayMs);
    timer.unref();
  };

  return {
    checkForUpdates,
    downloadUpdate,
    quitAndInstall() {
      appendDesktopLog("desktop.updater", "Restarting app to apply downloaded update.");
      autoUpdater.quitAndInstall(false, true);
    },
    scheduleInitialCheck,
  };
}
