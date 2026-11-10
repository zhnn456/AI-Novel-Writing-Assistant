import type { LicenseEdition } from "@/api/license";

/**
 * 功能 → 最低授权版本 映射。
 * 与 Keygate 后台套餐定价及卖家确认的功能边界保持一致：
 *  - 试用版（¥0，7 天，邮箱领取）：全部功能开放，不限章节、不限次数
 *  - 标准版（¥199/年、¥99/半年）：试用期结束后继续使用标准功能
 *  - 专业版（¥399/买断）：全部功能，永久
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

/** 当前版本是否可用某功能。试用期内全部功能开放，由授权有效期兜底。 */
export function featureAvailable(edition: LicenseEdition, feature: FeatureKey): boolean {
  if (edition === "trial") {
    return true;
  }
  const need = FEATURE_MIN_EDITION[feature];
  return EDITION_RANK[edition] >= EDITION_RANK[need];
}

export function isActivated(edition: LicenseEdition): boolean {
  return EDITION_RANK[edition] >= 1;
}
