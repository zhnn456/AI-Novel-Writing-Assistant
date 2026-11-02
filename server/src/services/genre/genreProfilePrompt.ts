/**
 * 把题材的 AI 丰富档案（profileJson，10 维）格式化成给模型看的提示词文本。
 * 各生成环节（开书/立项、书名、短篇、素材导出等）复用同一份格式化，保证口径一致。
 */
export function formatGenreProfileBlock(profileJson: string | null | undefined): string {
  if (!profileJson) {
    return "";
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(profileJson);
  } catch {
    return "";
  }
  const fields: Array<[string, string]> = [
    ["核心卖点/爽点", "sellingPoint"],
    ["核心冲突", "coreConflict"],
    ["读者期待", "readerExpectation"],
    ["经典结构与套路", "classicStructure"],
    ["世界观与场景", "worldSetting"],
    ["典型角色", "typicalCharacters"],
    ["节奏建议", "pacingAdvice"],
    ["代表作品/关联小说", "representativeWorks"],
    ["常见雷区", "commonPitfalls"],
  ];
  const lines = fields
    .map(([label, key]) => {
      const value = parsed[key];
      if (typeof value !== "string" || !value.trim()) {
        return "";
      }
      return `· ${label}：${value.trim()}`;
    })
    .filter(Boolean);
  if (lines.length === 0) {
    return "";
  }
  return `题材丰富档案（创作本题材时必须遵循的卖点、冲突、结构、代表作品与雷区）：\n${lines.join("\n")}`;
}
