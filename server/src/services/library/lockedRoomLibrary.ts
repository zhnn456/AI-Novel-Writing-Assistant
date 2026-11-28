import fs from "node:fs";
import path from "node:path";

/**
 * 密室诡计样本库 · 只读加载器（P0）
 *
 * 数据来源两级：
 * 1. 打包资源 `resources/assets/locked-room/current/index.json`（安装包兜底）
 * 2. 热更新目录同路径（P1 由更新器原子替换后再切换指针）
 *
 * P0 只读，不写盘、不联网；读取失败一律降级为「无知识库」，
 * 绝不让创作链路因为样本库缺失而失败。
 */

const LIBRARY_ID = "locked-room";
const RELATIVE_DIR = path.join("assets", "locked-room");

export interface LockedRoomTechnique {
  id: string;
  family?: string;
  name?: string;
  coreAction?: string;
  props?: unknown;
  requirements?: unknown;
  detectionClues?: unknown;
  fairness?: string;
  difficulty?: string;
  caution?: string;
}

export interface LockedRoomIndex {
  library: string;
  version: string;
  generatedAt?: string;
  modules: {
    definition?: any;
    taxonomy?: any;
    techniques?: { techniques?: LockedRoomTechnique[]; combinationRules?: unknown; doNotUse?: unknown };
    cases?: any;
    motives?: any;
    craft?: any;
  };
  hash?: string;
}

export interface LockedRoomSnapshot {
  source: "resources" | "development" | "missing";
  root: string | null;
  version: string | null;
  index: LockedRoomIndex | null;
}

function candidateRoots(): string[] {
  const roots: string[] = [];
  const envDir = process.env.AI_NOVEL_DESKTOP_RESOURCES_DIR?.trim();
  if (envDir) roots.push(path.resolve(envDir));
  // 打包态：desktop 侧 spawn 服务时 cwd 即为 resources 根
  if (process.cwd()) roots.push(process.cwd());
  // 开发态：仓库根下的 builder 目录
  roots.push(path.resolve(__dirname, "../../../../desktop/builder"));
  return roots;
}

export function resolveLockedRoomRoot(): { root: string; source: LockedRoomSnapshot["source"] } | null {
  for (const base of candidateRoots()) {
    const dir = path.join(base, RELATIVE_DIR);
    if (fs.existsSync(path.join(dir, "current", "index.json")) || fs.existsSync(path.join(dir, ".bak", "index.json"))) {
      const source: LockedRoomSnapshot["source"] =
        base === process.cwd() ? "resources" : "development";
      return { root: dir, source };
    }
  }
  return null;
}

let cache: LockedRoomSnapshot | null = null;

/** current 被写坏、或热更新只完成一半时，退到 .bak，保证创作链路不白屏。 */
function readIndexFrom(root: string): { index: LockedRoomIndex; dir: "current" | ".bak" } | null {
  for (const dir of ["current", ".bak"] as const) {
    const file = path.join(root, dir, "index.json");
    try {
      const raw = fs.readFileSync(file, "utf8");
      const index = JSON.parse(raw) as LockedRoomIndex;
      if (!index || typeof index.version !== "string") continue;
      return { index, dir };
    } catch {
      continue;
    }
  }
  return null;
}

export function loadLockedRoomLibrary(options: { force?: boolean } = {}): LockedRoomSnapshot {
  if (cache && !options.force) return cache;
  const located = resolveLockedRoomRoot();
  if (!located) {
    cache = { source: "missing", root: null, version: null, index: null };
    return cache;
  }
  const loaded = readIndexFrom(located.root);
  if (!loaded) {
    console.warn("[locked-room] 样本库读取失败（current 与 .bak 均不可用），按缺失处理");
    cache = { source: "missing", root: null, version: null, index: null };
    return cache;
  }
  cache = {
    source: located.source,
    root: located.root,
    version: loaded.index.version ?? null,
    index: loaded.index,
  };
  if (loaded.dir !== "current") {
    console.warn("[locked-room] current 不可用，已回落到 .bak");
  }
  return cache;
}

export function listLockedRoomTechniques(): LockedRoomTechnique[] {
  return loadLockedRoomLibrary().index?.modules.techniques?.techniques ?? [];
}

export function findLockedRoomTechnique(id: string): LockedRoomTechnique | null {
  return listLockedRoomTechniques().find((item) => item.id === id) ?? null;
}

/** 仅保留铁律级约束，其他的当作可选建议，避免提示词过长稀释指令。 */
function collectIronRules(definition: any): string[] {
  const rules = Array.isArray(definition?.fairnessRules) ? definition.fairnessRules : [];
  return rules
    .filter((rule: any) => rule?.level === "铁律")
    .map((rule: any) => `${rule.id} ${rule.rule}`)
    .slice(0, 6);
}

/**
 * 生成可拼进系统提示词的 2–3KB 文本块。
 * 样本库缺失时返回空串，调用方无需分支判断。
 */
export function buildLockedRoomPromptBlock(): string {
  const snapshot = loadLockedRoomLibrary();
  const modules = snapshot.index?.modules;
  if (!modules) return "";

  const def = modules.definition ?? {};
  const oneLine = def?.definition?.oneLine ?? "";
  const coreQuestion = def?.definition?.coreQuestion ?? "";
  const questions = Array.isArray(def?.fiveDiagnosticQuestions)
    ? def.fiveDiagnosticQuestions.map((item: any, i: number) => `${i + 1}. ${typeof item === "string" ? item : item?.question ?? ""}`)
    : [];
  const ironRules = collectIronRules(def);

  const selector = Array.isArray(modules.taxonomy?.quickSelector)
    ? modules.taxonomy.quickSelector
        .slice(0, 4)
        .map((row: any) => `- ${row.want} → ${Array.isArray(row.pick) ? row.pick.join("、") : row.pick}`)
    : [];

  const injection = Array.isArray(modules.craft?.promptInjection?.blocks)
    ? modules.craft.promptInjection.blocks.map((block: any) => `${block.id} ${block.name}：${block.text}`)
    : [];

  const techniques = listLockedRoomTechniques();
  const techniqueNames = techniques
    .slice(0, 18)
    .map((item) => `${item.id} ${item.name ?? ""}`)
    .join("；");

  const lines: string[] = [
    "【密室诡计样本库】",
    oneLine ? `定义：${oneLine}` : "",
    coreQuestion ? `核心追问：${coreQuestion}` : "",
  ];
  if (ironRules.length) lines.push(`铁律：\n${ironRules.map((rule) => `- ${rule}`).join("\n")}`);
  if (questions.length) lines.push(`五项诊断：\n${questions.join("\n")}`);
  if (selector.length) lines.push(`按需求选型：\n${selector.join("\n")}`);
  if (techniqueNames) lines.push(`可用手法编号（引用时写编号）：${techniqueNames}`);
  if (injection.length) lines.push(`产出要求：\n${injection.join("\n")}`);
  lines.push(`（样本库版本 ${snapshot.version ?? "unknown"}，来源 ${snapshot.source}；以上为约束，不得凭空发明手法。）`);

  return lines.filter(Boolean).join("\n");
}

const MYSTERY_GENRE_KEYWORDS = [
  "悬疑",
  "推理",
  "侦探",
  "探案",
  "密室",
  "犯罪",
  "惊悚",
  "诡计",
  "mystery",
  "detective",
  "crime",
  "thriller",
];

/** 只有推理/悬疑类题材才注入，避免给言情、玄幻平白增加 2–3KB 约束。 */
export function isLockedRoomGenre(
  genre?: { name?: string | null; description?: string | null; template?: string | null } | null,
): boolean {
  if (!genre) return false;
  const text = [genre.name, genre.description, genre.template]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
  if (!text) return false;
  return MYSTERY_GENRE_KEYWORDS.some((keyword) => text.includes(keyword.toLowerCase()));
}

/** 题材命中时返回注入块，否则返回空串；调用方直接拼进创作底座即可。 */
export function buildLockedRoomProductionBlock(
  genre?: { name?: string | null; description?: string | null; template?: string | null } | null,
): string {
  return isLockedRoomGenre(genre) ? buildLockedRoomPromptBlock() : "";
}
