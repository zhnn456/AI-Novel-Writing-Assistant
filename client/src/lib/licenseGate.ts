import type { LicenseEdition } from "@/api/license";

/**
 * 功能 → 最低授权版本 映射。
 * 与 Keygate 后台套餐定价及卖家确认的功能边界保持一致：
 *  - 试用版（¥0/7天）：基础生成（重写/续写/检查），限 1 部 3 章
 *  - 标准版（¥199/年、¥99/半年）：在试用基础上解锁 修复/摘要/任务单/场景卡/写作公式/高级反AI味
 *  - 专业版（¥399/买断）：在标准版之上解锁 导演模式/作品分析/短剧漫画/市场雷达/创意中心
 */
export type FeatureKey =
  | "generate" // 基础生成（重写/续写/检查）
  | "repair" // 修复（扩写/压缩/自动修复/冲突/情绪/文风/对话/描写）
  | "summarize" // 章节摘要
  | "taskSheet" // 章节任务单
  | "sceneCards" // 场景拆解
  | "writingFormula" // 写作公式
  | "director" // 导演模式
  | "bookAnalysis" // 作品分析
  | "dramaComic" // 短剧 / 漫画
  | "marketRadar" // 市场雷达
  | "creativeHub"; // 创意中心

const FEATURE_MIN_EDITION: Record<FeatureKey, LicenseEdition> = {
  generate: "trial",
  repair: "standard",
  summarize: "standard",
  taskSheet: "standard",
  sceneCards: "standard",
  writingFormula: "standard",
  director: "premium",
  bookAnalysis: "premium",
  dramaComic: "premium",
  marketRadar: "premium",
  creativeHub: "premium",
};

const EDITION_RANK: Record<LicenseEdition, number> = {
  none: 0,
  trial: 1,
  standard: 2,
  premium: 3,
};

/** 当前版本是否可用某功能。 */
export function featureAvailable(edition: LicenseEdition, feature: FeatureKey): boolean {
  const need = FEATURE_MIN_EDITION[feature];
  return EDITION_RANK[edition] >= EDITION_RANK[need];
}

export function isActivated(edition: LicenseEdition): boolean {
  return EDITION_RANK[edition] >= 1;
}
