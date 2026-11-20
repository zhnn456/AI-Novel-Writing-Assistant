import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import { appendDesktopLog } from "./logging";
import {
  installBucket,
  libraryFeedSources,
  shouldApplyManifest,
  verifyLibraryManifest,
  type LibraryManifest,
  type LibraryManifestFile,
} from "./libraryManifest";
import { resolveDesktopResourcesDir } from "./paths";
import { compareVersions, type UpdateFeedSource } from "./updateFeed";

/**
 * 密室诡计样本库 · 客户端热更新器（P1）
 *
 * 不换 exe，只换 resources/assets/locked-room 下的数据：
 * - 复用 updateFeed 的 HTTPS 主源 / 明文备源顺序；
 * - manifest 必须带 Keygate Ed25519 签名，验签失败不落盘；
 * - 先下载到 `.next` 并逐文件校验 sha256，再两步换目录，失败只清 `.next`；
 * - 灰度 rollout / killSwitch / 连续 3 次失败停手 24 小时；
 * - 全程静默：不弹窗、不阻塞启动，失败只写日志。
 */

const LIBRARY_DIR_NAME = path.join("assets", "locked-room");

interface LibraryUpdateState {
  failedAttempts?: number;
  cooldownUntil?: string;
  killSwitchUntil?: string;
  lastVersion?: string;
  lastAppliedAt?: string;
  lastError?: string;
}

export interface LibraryUpdateResult {
  status: "updated" | "up-to-date" | "skipped" | "failed";
  version?: string;
  reason: string;
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function localLibraryVersion(root: string): string | null {
  try {
    const value = fs.readFileSync(path.join(root, "version.txt"), "utf8").trim();
    return value || null;
  } catch {
    return null;
  }
}

async function fetchManifest(source: UpdateFeedSource, timeoutMs: number): Promise<LibraryManifest> {
  const response = await fetch(`${source.url}manifest.json`, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const manifest = (await response.json()) as LibraryManifest;
  if (!manifest || typeof manifest.version !== "string") throw new Error("清单格式无法解析");
  return manifest;
}

async function downloadFile(source: UpdateFeedSource, file: LibraryManifestFile, targetPath: string): Promise<void> {
  const url = `${source.url}${encodeURIComponent(file.path).replace(/%2F/g, "/")}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${file.path} HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length !== file.size) throw new Error(`${file.path} 大小不符：${buffer.length} != ${file.size}`);
  const digest = crypto.createHash("sha256").update(buffer).digest("hex");
  if (digest !== file.sha256) throw new Error(`${file.path} sha256 不符`);
  await fs.promises.writeFile(targetPath, buffer);
}

/** 下载清单里所有文件到 `.next`，逐文件校验并复算 aggregate。 */
async function stageManifest(source: UpdateFeedSource, manifest: LibraryManifest, nextDir: string): Promise<void> {
  await fsp.rm(nextDir, { recursive: true, force: true });
  await fsp.mkdir(nextDir, { recursive: true });
  for (const file of manifest.files) {
    const safeName = file.path.replace(/^[\\/]+/, "");
    if (safeName.includes("..")) throw new Error(`非法路径 ${file.path}`);
    await downloadFile(source, file, path.join(nextDir, safeName));
  }
  const expected = manifest.files
    .map((file) => `${file.path}:${file.sha256}`)
    .sort()
    .join("\n");
  const aggregate = crypto.createHash("sha256").update(Buffer.from(expected, "utf8")).digest("hex");
  if (aggregate !== manifest.aggregate) throw new Error("aggregate 不一致（清单被改动）");
}

/** current → .bak，.next → current；第二步失败就把 .bak 换回来。 */
async function swapDirectories(root: string): Promise<void> {
  const current = path.join(root, "current");
  const next = path.join(root, ".next");
  const bak = path.join(root, ".bak");

  await fsp.rm(bak, { recursive: true, force: true });
  if (fs.existsSync(current)) {
    await fsp.rename(current, bak);
  }
  try {
    await fsp.rename(next, current);
  } catch (error) {
    if (fs.existsSync(bak)) await fsp.rename(bak, current).catch(() => undefined);
    throw error;
  }
}

function resolveStatePath(root: string): string {
  return path.join(root, "state.json");
}

function recordFailure(root: string, message: string): void {
  const statePath = resolveStatePath(root);
  const state = readJsonFile<LibraryUpdateState>(statePath) ?? {};
  const failedAttempts = (state.failedAttempts ?? 0) + 1;
  const patch: LibraryUpdateState = {
    failedAttempts,
    lastError: message.slice(0, 200),
  };
  if (failedAttempts >= 3) {
    patch.cooldownUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    patch.failedAttempts = 0;
  }
  try {
    writeJsonFile(statePath, { ...state, ...patch });
  } catch {
    // 状态写不进去也不能影响启动
  }
}

function recordSuccess(root: string, version: string, killSwitch: boolean): void {
  try {
    writeJsonFile(resolveStatePath(root), {
      failedAttempts: 0,
      lastVersion: version,
      lastAppliedAt: new Date().toISOString(),
      killSwitchUntil: killSwitch ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : undefined,
      lastError: undefined,
    });
  } catch {
    // 忽略
  }
}

export async function runLockedRoomLibraryUpdate(options: {
  appVersion: string;
  resourcesDir?: string;
  sources?: UpdateFeedSource[];
  /** 仅供离线自测覆盖公钥；生产调用不要传。 */
  publicKeyHex?: string;
}): Promise<LibraryUpdateResult> {
  if (process.env.AI_NOVEL_LOCKED_ROOM_UPDATE === "0") {
    return { status: "skipped", reason: "环境变量已关闭" };
  }

  const root = path.join(options.resourcesDir ?? resolveDesktopResourcesDir(), LIBRARY_DIR_NAME);
  const state = readJsonFile<LibraryUpdateState>(resolveStatePath(root)) ?? {};
  const now = Date.now();

  if (state.cooldownUntil && new Date(state.cooldownUntil).getTime() > now) {
    return { status: "skipped", reason: "连续失败冷却中" };
  }
  if (state.killSwitchUntil && new Date(state.killSwitchUntil).getTime() > now) {
    return { status: "skipped", reason: "killSwitch 生效中" };
  }

  const localVersion = localLibraryVersion(root);
  const bucket = installBucket();
  const sources = libraryFeedSources(options.sources);
  const failures: string[] = [];

  let manifest: LibraryManifest | null = null;
  let source: UpdateFeedSource | null = null;
  for (const candidate of sources) {
    try {
      const fetched = await fetchManifest(candidate, candidate.id === "hk" ? 6_000 : 4_000);
      if (!manifest || compareVersions(fetched.version, manifest.version) > 0) {
        manifest = fetched;
        source = candidate;
      }
      if (candidate.id === "hk" && compareVersions(fetched.version, localVersion ?? "0.0.0") > 0) break;
    } catch (error) {
      failures.push(`${candidate.label}: ${(error as Error).message}`);
    }
  }

  if (!manifest || !source) {
    const reason = `样本库清单均不可用：${failures.join("；")}`;
    appendDesktopLog("desktop.library", reason);
    recordFailure(root, reason);
    return { status: "failed", reason };
  }

  if (!verifyLibraryManifest(manifest, options.publicKeyHex)) {
    const reason = `manifest 验签失败（version ${manifest.version}），拒绝写入`;
    appendDesktopLog("desktop.library", reason);
    recordFailure(root, reason);
    return { status: "failed", reason };
  }

  const decision = shouldApplyManifest(manifest, {
    localVersion,
    appVersion: options.appVersion,
    bucket,
  });
  if (!decision.ok) {
    if (manifest.killSwitch) recordSuccess(root, localVersion ?? "", true);
    appendDesktopLog("desktop.library", `跳过样本库更新：${decision.reason}`);
    return {
      status: manifest.killSwitch ? "skipped" : "up-to-date",
      version: manifest.version,
      reason: decision.reason,
    };
  }

  const nextDir = path.join(root, ".next");
  try {
    await stageManifest(source, manifest, nextDir);
    await swapDirectories(root);
    await fsp.writeFile(path.join(root, "version.txt"), `${manifest.version}\n`, "utf8");
    recordSuccess(root, manifest.version, false);
    appendDesktopLog("desktop.library", `样本库已更新到 ${manifest.version}（来源 ${source.label}）`);
    return { status: "updated", version: manifest.version, reason: `已更新到 ${manifest.version}` };
  } catch (error) {
    const message = (error as Error).message;
    await fsp.rm(nextDir, { recursive: true, force: true }).catch(() => undefined);
    appendDesktopLog("desktop.library", `样本库更新失败：${message}`);
    recordFailure(root, message);
    return { status: "failed", version: manifest.version, reason: message };
  }
}
