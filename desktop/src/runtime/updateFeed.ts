import { appendDesktopLog } from "./logging";

// 更新源排序以通道完整性优先：明文 HTTP 可被中间人替换更新包（0.5.30 安全审查 P1）。
// HTTPS 主源（Cloudflare 前置）先查；国内 8.160.174.123 是裸 IP、无法部署有效 TLS 证书，
// 在为它配好带域名的 HTTPS 之前只作兜底。AI_NOVEL_UPDATE_FEED_HK / AI_NOVEL_UPDATE_FEED_CN
// 环境变量仍可覆盖对应地址（后续国内换域名时改这里即可）。
export interface UpdateFeedSource {
  id: "hk" | "cn";
  label: string;
  url: string;
}

export const UPDATE_FEED_SOURCES: UpdateFeedSource[] = [
  {
    id: "hk",
    label: "HTTPS 主源",
    url: (process.env.AI_NOVEL_UPDATE_FEED_HK || "https://keygate.de5.net/whale/files/").replace(/\/?$/, "/"),
  },
  {
    id: "cn",
    label: "明文备用源",
    url: (process.env.AI_NOVEL_UPDATE_FEED_CN || "http://8.160.174.123/whale/files/").replace(/\/?$/, "/"),
  },
];

export interface UpdateManifest {
  version: string;
  releaseNotes: string | null;
}

/** 更新包必须走 HTTPS：明文源上的清单与 sha512 可被中间人整体替换，等同于远程执行安装包。 */
function isSecureFeedUrl(url: string): boolean {
  return url.trim().toLowerCase().startsWith("https://");
}

/** 默认拒绝明文源；只有显式打开开关（且明知风险）才允许，供内网调试使用。 */
function allowsInsecureFeed(): boolean {
  return process.env.AI_NOVEL_ALLOW_INSECURE_UPDATE_FEED === "1";
}

let insecureSkipLogged = false;

/** 本次真正允许参与检查/下载的源（默认只有 HTTPS 源）。 */
export function activeUpdateFeedSources(): UpdateFeedSource[] {
  const usable = UPDATE_FEED_SOURCES.filter((source) => isSecureFeedUrl(source.url) || allowsInsecureFeed());
  if (!allowsInsecureFeed() && !insecureSkipLogged) {
    insecureSkipLogged = true;
    for (const source of UPDATE_FEED_SOURCES) {
      if (!isSecureFeedUrl(source.url)) {
        appendDesktopLog(
          "desktop.updater.feed",
          `${source.label}（${source.url}）为明文 HTTP，已跳过；确需启用请设置 AI_NOVEL_ALLOW_INSECURE_UPDATE_FEED=1。`,
        );
      }
    }
  }
  return usable;
}

export interface FeedSelection {
  source: UpdateFeedSource;
  manifest: UpdateManifest;
  reason: string;
}

function parseReleaseNotesBlock(text: string): string | null {
  const inline = text.match(/^releaseNotes:\s*(?!\|)(\S.*)$/m);
  if (inline) {
    return inline[1].trim() || null;
  }

  const startMatch = text.match(/^releaseNotes:\s*\|[+-]?\s*$/m);
  if (!startMatch || startMatch.index === undefined) {
    return null;
  }

  const rest = text.slice(startMatch.index + startMatch[0].length);
  const lines: string[] = [];
  for (const raw of rest.split(/\r?\n/)) {
    if (raw.trim().length === 0) {
      lines.push("");
      continue;
    }
    const indent = raw.match(/^\s*/)?.[0].length ?? 0;
    if (indent === 0) {
      break;
    }
    lines.push(raw.replace(/^\s{0,4}/, ""));
  }
  const notes = lines.join("\n").trim();
  return notes.length > 0 ? notes : null;
}

export function parseUpdateManifest(text: string): UpdateManifest | null {
  const versionMatch = text.match(/^version:\s*(\d+\.\d+\.\d+\S*)\s*$/m);
  if (!versionMatch) {
    return null;
  }
  return {
    version: versionMatch[1].trim(),
    releaseNotes: parseReleaseNotesBlock(text),
  };
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(pa.length, pb.length);
  for (let index = 0; index < length; index += 1) {
    const left = pa[index] ?? 0;
    const right = pb[index] ?? 0;
    if (left !== right) {
      return left > right ? 1 : -1;
    }
  }
  return 0;
}

async function fetchManifest(source: UpdateFeedSource, timeoutMs: number): Promise<UpdateManifest> {
  const response = await fetch(`${source.url}latest.yml`, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const manifest = parseUpdateManifest(await response.text());
  if (!manifest) {
    throw new Error("清单格式无法解析");
  }
  return manifest;
}

/**
 * 选择本次检查使用的更新源（仅 HTTPS）：
 * 1. 先读 HTTPS 主源；版本比当前新，直接用它（绝大多数情况，只发一次请求）。
 * 2. 主源读不到或没有更新，再读第二个 HTTPS 源；两者都有更新时取版本更高的那个。
 * 3. 明文 HTTP 源默认不参与，避免清单与 sha512 被替换。
 * 4. 全部读不到，抛错交给调用方展示离线提示。
 */
export async function selectUpdateFeed(currentVersion: string): Promise<FeedSelection> {
  const sources = activeUpdateFeedSources();
  const primary = sources[0];
  const fallback = sources[1] ?? null;
  if (!primary) {
    throw new Error("没有启用的 HTTPS 更新源，已拒绝使用明文更新源。");
  }
  const failures: string[] = [];

  let primaryManifest: UpdateManifest | null = null;
  try {
    primaryManifest = await fetchManifest(primary, 6_000);
  } catch (error) {
    failures.push(`${primary.label}不可用：${(error as Error).message}`);
    appendDesktopLog("desktop.updater.feed", `${primary.label}读取失败${fallback ? "，转备用源。" : "。"}`);
  }

  if (primaryManifest && compareVersions(primaryManifest.version, currentVersion) > 0) {
    appendDesktopLog("desktop.updater.feed", `${primary.label}清单版本 ${primaryManifest.version} 高于本机 ${currentVersion}，使用主源。`);
    return { source: primary, manifest: primaryManifest, reason: `${primary.label}可用且版本较新` };
  }

  let fallbackManifest: UpdateManifest | null = null;
  if (fallback) {
    try {
      fallbackManifest = await fetchManifest(fallback, 4_000);
    } catch (error) {
      failures.push(`${fallback.label}不可用：${(error as Error).message}`);
      appendDesktopLog("desktop.updater.feed", `${fallback.label}读取失败。`);
    }
  }

  if (fallback && fallbackManifest && (!primaryManifest || compareVersions(fallbackManifest.version, primaryManifest.version) > 0)) {
    appendDesktopLog("desktop.updater.feed", `${fallback.label}清单版本 ${fallbackManifest.version} 更优，使用备用源。`);
    return { source: fallback, manifest: fallbackManifest, reason: `${fallback.label}版本更高` };
  }

  if (primaryManifest) {
    appendDesktopLog("desktop.updater.feed", `使用${primary.label}（本机已是最新或仅有持平版本）。`);
    return { source: primary, manifest: primaryManifest, reason: `${primary.label}版本持平或最新` };
  }

  throw new Error(`更新源均不可用：${failures.join("；")}`);
}

/** 取与当前版本对应的更新说明：优先主源清单，其次备用源清单；版本不一致时返回 null。 */
export async function fetchReleaseNotesForVersion(version: string): Promise<string | null> {
  for (const source of activeUpdateFeedSources()) {
    try {
      const manifest = await fetchManifest(source, source.id === "hk" ? 6_000 : 4_000);
      if (manifest.version === version && manifest.releaseNotes) {
        return manifest.releaseNotes;
      }
    } catch {
      // 单个源读不到就换下一个，全部失败时由调用方用内置文案兜底。
    }
  }
  return null;
}
