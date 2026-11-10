import { appendDesktopLog } from "./logging";

// 双线更新源：国内主线优先（大陆下载快），香港作为海外与故障兜底。
// 客户端每次检查都会先读国内清单，读不到或版本落后时才回落到香港。
export interface UpdateFeedSource {
  id: "cn" | "hk";
  label: string;
  url: string;
}

export const UPDATE_FEED_SOURCES: UpdateFeedSource[] = [
  {
    id: "cn",
    label: "国内主源",
    url: (process.env.AI_NOVEL_UPDATE_FEED_CN || "http://8.160.174.123/whale/files/").replace(/\/?$/, "/"),
  },
  {
    id: "hk",
    label: "香港备用源",
    url: (process.env.AI_NOVEL_UPDATE_FEED_HK || "https://keygate.de5.net/whale/files/").replace(/\/?$/, "/"),
  },
];

export interface UpdateManifest {
  version: string;
  releaseNotes: string | null;
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
 * 选择本次检查使用的更新源：
 * 1. 先读国内主源；国内版本比当前新，直接用它（绝大多数情况，只发一次请求）。
 * 2. 国内读不到或没有更新，再读香港；两者都有更新时取版本更高的那个。
 * 3. 两个都读不到，抛错交给调用方展示离线提示。
 */
export async function selectUpdateFeed(currentVersion: string): Promise<FeedSelection> {
  const [cn, hk] = UPDATE_FEED_SOURCES;
  const failures: string[] = [];

  let cnManifest: UpdateManifest | null = null;
  try {
    cnManifest = await fetchManifest(cn, 4_000);
  } catch (error) {
    failures.push(`${cn.label}不可用：${(error as Error).message}`);
    appendDesktopLog("desktop.updater.feed", `${cn.label}读取失败，转香港备用源。`);
  }

  if (cnManifest && compareVersions(cnManifest.version, currentVersion) > 0) {
    appendDesktopLog("desktop.updater.feed", `${cn.label}清单版本 ${cnManifest.version} 高于本机 ${currentVersion}，使用国内主源。`);
    return { source: cn, manifest: cnManifest, reason: `${cn.label}可用且版本较新` };
  }

  let hkManifest: UpdateManifest | null = null;
  try {
    hkManifest = await fetchManifest(hk, 6_000);
  } catch (error) {
    failures.push(`${hk.label}不可用：${(error as Error).message}`);
    appendDesktopLog("desktop.updater.feed", `${hk.label}读取失败。`);
  }

  if (hkManifest && (!cnManifest || compareVersions(hkManifest.version, cnManifest.version) > 0)) {
    appendDesktopLog("desktop.updater.feed", `${hk.label}清单版本 ${hkManifest.version} 更优，使用香港备用源。`);
    return { source: hk, manifest: hkManifest, reason: `${hk.label}版本更高` };
  }

  if (cnManifest) {
    appendDesktopLog("desktop.updater.feed", `使用${cn.label}（本机已是最新或仅有持平版本）。`);
    return { source: cn, manifest: cnManifest, reason: `${cn.label}版本持平或最新` };
  }

  throw new Error(`更新源均不可用：${failures.join("；")}`);
}

/** 取与当前版本对应的更新说明：优先国内清单，其次香港清单；版本不一致时返回 null。 */
export async function fetchReleaseNotesForVersion(version: string): Promise<string | null> {
  for (const source of UPDATE_FEED_SOURCES) {
    try {
      const manifest = await fetchManifest(source, source.id === "cn" ? 4_000 : 6_000);
      if (manifest.version === version && manifest.releaseNotes) {
        return manifest.releaseNotes;
      }
    } catch {
      // 单个源读不到就换下一个，全部失败时由调用方用内置文案兜底。
    }
  }
  return null;
}
