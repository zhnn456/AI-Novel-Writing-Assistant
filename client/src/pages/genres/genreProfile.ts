export interface GenreProfile {
  positioning: string;
  sellingPoint: string;
  coreConflict: string;
  readerExpectation: string;
  classicStructure: string;
  worldSetting: string;
  typicalCharacters: string;
  pacingAdvice: string;
  representativeWorks: string;
  commonPitfalls: string;
}

export interface GenreProfileField {
  key: keyof GenreProfile;
  label: string;
  hint: string;
}

export const GENRE_PROFILE_FIELDS: GenreProfileField[] = [
  { key: "positioning", label: "题材定位", hint: "一句话说清这是什么书、核心标签与基调。" },
  { key: "sellingPoint", label: "核心卖点 / 爽点", hint: "最吸引人的地方，读者为什么会一直追读。" },
  { key: "coreConflict", label: "核心冲突", hint: "贯穿全书的主要矛盾与张力来源。" },
  { key: "readerExpectation", label: "读者期待", hint: "这类读者打开书想要什么，不能让他们失望的点。" },
  { key: "classicStructure", label: "经典结构与套路", hint: "开篇打法、推进方式、中期节奏。" },
  { key: "worldSetting", label: "世界观与场景", hint: "故事通常发生的舞台、规则与氛围。" },
  { key: "typicalCharacters", label: "典型角色", hint: "主角类型、配角结构与关系模板。" },
  { key: "pacingAdvice", label: "节奏建议", hint: "爽点密度、升级频率、情绪起伏如何把控。" },
  { key: "representativeWorks", label: "代表作品 / 关联小说", hint: "3~6 部同题材代表作，书名号括起，供参考。" },
  { key: "commonPitfalls", label: "常见雷区", hint: "写这个题材最容易踩的坑、读者最反感的写法。" },
];

export function emptyGenreProfile(): GenreProfile {
  return {
    positioning: "",
    sellingPoint: "",
    coreConflict: "",
    readerExpectation: "",
    classicStructure: "",
    worldSetting: "",
    typicalCharacters: "",
    pacingAdvice: "",
    representativeWorks: "",
    commonPitfalls: "",
  };
}

export function parseGenreProfile(profileJson: string | null | undefined): GenreProfile {
  const empty = emptyGenreProfile();
  if (!profileJson) {
    return empty;
  }
  try {
    const parsed = JSON.parse(profileJson) as Record<string, unknown>;
    const result = { ...empty };
    for (const key of Object.keys(empty) as (keyof GenreProfile)[]) {
      const value = parsed[key];
      if (typeof value === "string") {
        result[key] = value.trim();
      }
    }
    return result;
  } catch {
    return empty;
  }
}

export function buildGenreProfileJson(profile: GenreProfile): string {
  return JSON.stringify(profile);
}

export function hasGenreProfileContent(profile: GenreProfile): boolean {
  return GENRE_PROFILE_FIELDS.some((field) => Boolean(profile[field.key].trim()));
}
