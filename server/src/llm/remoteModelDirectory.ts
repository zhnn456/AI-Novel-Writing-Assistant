/**
 * 远程「推荐模型目录」：让推荐模型不写死在安装包里。
 *
 * 现状：PROVIDERS 的 defaultModel / models 是编进 exe 的常量，模型几个月换一代，
 * 用户看到的一直是出厂那年的名字。要改必须重新打包 + 全量发版，太重。
 *
 * 做法：把推荐清单做成服务器上的一个 JSON（与 notice.json 同一套静态分发）：
 *   https://keygate.de5.net/whale/files/models.json
 * 启动时先用本地缓存（上次成功的快照）秒级生效，随后联网刷新；之后每 6 小时再刷，
 * 设置页也提供「立即同步」。改服务器上这一个文件 → 全量用户下次启动就换新模型，
 * 不用出包、不用让用户重下安装包。
 *
 * 与 modelCatalog.ts 的分工：
 *   - modelCatalog.ts 用用户自己的 API Key 去拉厂商真实可用模型（按需、每厂商）；
 *   - 本模块是「出厂推荐 + 兜底清单」，没有 Key 的新用户看到的就是它。
 *
 * 边界：远程可改「推荐哪个模型 / 可选模型清单 / 官方接口地址」，但地址必须是 http(s)；
 * envKey、maxTokens 这些跟调用方式绑死的字段不开放，一个写错的目录文件不能把全量用户打挂。
 * 拉不到、校验不过、字段非法：保留当前值，绝不致盲。
 */
import fs from "node:fs";
import path from "node:path";
import { isBuiltinLLMProvider } from "@ai-novel/shared/types/llm";
import { PROVIDERS } from "./providers";
import { resolveDataRoot } from "../runtime/appPaths";

interface DirectoryEntry {
  baseURL?: string;
  defaultModel?: string;
  models?: string[];
}

interface DirectoryFile {
  schema: 1;
  updatedAt: string;
  note?: string;
  providers: Record<string, DirectoryEntry>;
}

export interface ModelDirectoryMeta {
  /** 目录文件地址。 */
  source: string;
  /** 目录自己声明的更新时间（服务器文件里写的）。 */
  updatedAt: string | null;
  /** 本机最后一次成功应用的时间。 */
  appliedAt: string | null;
  applied: boolean;
  online: boolean;
  lastError: string | null;
  providerCount: number;
}

const DIRECTORY_URL =
  process.env.AI_NOVEL_MODEL_DIRECTORY_URL || "https://keygate.de5.net/whale/files/models.json";
const CACHE_FILE = "model-directory.json";
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** 单厂商最多接受多少可选模型，防止写错把界面撑爆。 */
const MAX_MODELS_PER_PROVIDER = 30;

let meta: ModelDirectoryMeta = {
  source: DIRECTORY_URL,
  updatedAt: null,
  appliedAt: null,
  applied: false,
  online: false,
  lastError: null,
  providerCount: 0,
};

let inflight: Promise<ModelDirectoryMeta> | null = null;

function cacheFilePath(): string {
  return path.join(resolveDataRoot(), CACHE_FILE);
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** 校验并规整目录；有一处不合法就整份丢弃，不做部分应用。 */
export function parseModelDirectory(raw: unknown): DirectoryFile | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (record.schema !== 1) return null;
  if (typeof record.updatedAt !== "string" || !record.updatedAt.trim()) return null;
  const providersRaw = record.providers;
  if (!providersRaw || typeof providersRaw !== "object") return null;

  const providers: Record<string, DirectoryEntry> = {};
  for (const [key, value] of Object.entries(providersRaw as Record<string, unknown>)) {
    if (!isBuiltinLLMProvider(key)) continue;
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    const entry: DirectoryEntry = {};
    if (typeof item.baseURL === "string" && isHttpUrl(item.baseURL.trim())) {
      entry.baseURL = item.baseURL.trim().replace(/\/+$/, "");
    }
    if (typeof item.defaultModel === "string" && item.defaultModel.trim()) {
      entry.defaultModel = item.defaultModel.trim();
    }
    if (Array.isArray(item.models)) {
      const models = item.models
        .filter((model): model is string => typeof model === "string" && model.trim().length > 0)
        .map((model) => model.trim())
        .slice(0, MAX_MODELS_PER_PROVIDER);
      if (models.length) entry.models = Array.from(new Set(models));
    }
    if (entry.baseURL || entry.defaultModel || entry.models) providers[key] = entry;
  }

  if (!Object.keys(providers).length) return null;
  return {
    schema: 1,
    updatedAt: record.updatedAt.trim(),
    note: typeof record.note === "string" ? record.note : undefined,
    providers,
  };
}

/** 应用到内存里的 PROVIDERS：只覆盖 defaultModel / models。 */
function applyDirectory(directory: DirectoryFile): number {
  let count = 0;
  for (const [key, entry] of Object.entries(directory.providers)) {
    if (!isBuiltinLLMProvider(key)) continue;
    const target = PROVIDERS[key];
    if (!target) continue;

    const models = entry.models?.length ? [...entry.models] : [...target.models];
    const defaultModel = entry.defaultModel ?? target.defaultModel;
    // 默认模型必须出现在可选清单里，否则「填了 Key 但模型名不存在」直接报错。
    if (!models.includes(defaultModel)) models.unshift(defaultModel);
    target.models = models;
    target.defaultModel = defaultModel;
    // 地址只在目录显式给出、且是 http(s) 时才覆盖，避免把官方地址改空。
    if (entry.baseURL) target.baseURL = entry.baseURL;
    count += 1;
  }
  return count;
}

function readCacheFile(): unknown {
  try {
    return JSON.parse(fs.readFileSync(cacheFilePath(), "utf8")) as unknown;
  } catch {
    return null;
  }
}

function writeCacheFile(directory: DirectoryFile): void {
  try {
    fs.mkdirSync(path.dirname(cacheFilePath()), { recursive: true });
    fs.writeFileSync(cacheFilePath(), JSON.stringify(directory, null, 2), "utf8");
  } catch {
    // 缓存写失败不影响本次生效。
  }
}

function markApplied(directory: DirectoryFile, providerCount: number): void {
  meta = {
    ...meta,
    updatedAt: directory.updatedAt,
    appliedAt: new Date().toISOString(),
    applied: true,
    providerCount,
    lastError: null,
  };
}

/** 先用本地缓存顶上，保证断网/离线启动也有正确的推荐模型。 */
export function bootstrapModelDirectory(): void {
  if (!isHttpUrl(DIRECTORY_URL)) return;
  const cached = parseModelDirectory(readCacheFile());
  if (!cached) return;
  markApplied(cached, applyDirectory(cached));
}

export async function refreshModelDirectory(): Promise<ModelDirectoryMeta> {
  if (inflight) return inflight;
  inflight = (async () => {
    if (!isHttpUrl(DIRECTORY_URL)) {
      meta = { ...meta, lastError: `目录地址不合法：${DIRECTORY_URL}` };
      return meta;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      let res: Response;
      try {
        res = await fetch(DIRECTORY_URL, {
          signal: controller.signal,
          headers: { "cache-control": "no-cache" },
        });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = parseModelDirectory((await res.json()) as unknown);
      if (!parsed) throw new Error("目录内容格式不对，已忽略");
      writeCacheFile(parsed);
      markApplied(parsed, applyDirectory(parsed));
      meta = { ...meta, online: true };
      return meta;
    } catch (error) {
      meta = {
        ...meta,
        online: false,
        lastError: error instanceof Error ? error.message : String(error),
      };
      return meta;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function getModelDirectoryMeta(): ModelDirectoryMeta {
  return meta;
}

/** 启动时：缓存立即生效 → 联网刷新一次 → 每 6 小时再刷。 */
export function startModelDirectorySync(): void {
  bootstrapModelDirectory();
  void refreshModelDirectory();
  const timer = setInterval(() => {
    void refreshModelDirectory();
  }, REFRESH_INTERVAL_MS);
  timer.unref?.();
}
