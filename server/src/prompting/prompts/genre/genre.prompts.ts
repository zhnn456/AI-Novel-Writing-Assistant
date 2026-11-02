import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { genreEnrichProfileSchema, genreTreeDraftNodeSchema } from "./genre.promptSchemas";

export interface GenreTreePromptInput {
  prompt: string;
  retry: boolean;
  forceJson: boolean;
}

export const genreTreePrompt: PromptAsset<GenreTreePromptInput, z.infer<typeof genreTreeDraftNodeSchema>> = {
  id: "genre.tree.generate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: genreTreeDraftNodeSchema,
  render: (input) => {
    const retryInstruction = input.retry
      ? "\n你上一次没有输出合法 JSON。这一次只能返回一个 JSON 对象本体，禁止附带解释、Markdown、注释、代码块或任何额外文本。"
      : "";
    const providerJsonInstruction = input.forceJson
      ? "\n当前模型支持稳定 JSON 输出，请直接返回 JSON 对象本体。"
      : "";

    return [
      new SystemMessage([
        "你是资深网络小说类型策划专家。",
        "你的任务是根据用户给出的创作方向，生成一棵适合小说策划与产品标签使用的“类型树”。",
        "这棵树的目标不是堆砌名词，而是建立清晰、可区分、可落地的题材层级结构，帮助后续进行定位、标签组织与内容规划。",
        "",
        "只返回一个 JSON 对象，不要输出 Markdown、解释、注释、代码块或额外文本。",
        "",
        "固定 JSON 结构如下：",
        "{",
        '  "name": "主类型名称",',
        '  "description": "主类型说明",',
        '  "children": [',
        "    {",
        '      "name": "子类型名称",',
        '      "description": "子类型说明",',
        '      "children": [',
        "        {",
        '          "name": "下级类型名称",',
        '          "description": "下级类型说明",',
        '          "children": []',
        "        }",
        "      ]",
        "    }",
        "  ]",
        "}",
        "",
        "结构规则：",
        "1. 最多三层，且只能是：主类型 -> 子类型 -> 下级类型。",
        "2. 每个节点都必须包含 name、description、children 三个键，不要缺键，不要改名，不要新增近义字段。",
        "3. 若某节点不再继续细分，children 必须返回空数组。",
        "4. 结果必须是一棵结构清晰的单树，不要输出多个并列主类型。",
        "",
        "命名规则：",
        "1. name 必须简洁、明确、稳定，适合直接作为产品中的类型标签使用。",
        "2. 不要使用过长名称、解释式名称、宣传语、口号式表达。",
        "3. 同层节点之间必须有明确区分度，避免同义改写或轻微措辞变化。",
        "4. 名称优先体现题材核心差异，而不是泛泛的情绪词或质量判断。",
        "",
        "描述规则：",
        "1. description 必须说明该类型的题材特征、常见爽点、叙事重心或读者期待。",
        "2. 描述应具体、凝练，不要写成空话，如“内容精彩”“情节丰富”“很有代入感”。",
        "3. 描述应服务于类型区分，帮助用户理解“为什么它属于这一类”。",
        "",
        "策划规则：",
        "1. 优先建立有区分度的层级，而不是机械罗列尽可能多的子类。",
        "2. 子类型数量要克制，宁可少而清楚，也不要堆成一片标签菜市场。",
        "3. 下级类型应是对子类型的进一步细分，而不是跳到别的分类维度。",
        "4. 整棵树的划分维度应尽量统一，不要一层按世界观分、下一层突然按情感线或主角身份乱切。",
        "5. 若用户描述较模糊，应做保守、低风险、行业常见的类型归纳，不要过度发散。",
        "6. 输出结果应自然、自洽、可直接用于后续产品化和创作规划。",
        retryInstruction,
        providerJsonInstruction,
      ].join("\n")),
      new HumanMessage([
        "请根据下面的创作方向生成类型树：",
        "",
        input.prompt.trim(),
      ].join("\n")),
    ];
  },
};

export interface GenreEnrichPromptInput {
  genreName: string;
  genreDescription: string;
  genrePath: string;
  retry: boolean;
  forceJson: boolean;
}

export const genreEnrichPrompt: PromptAsset<GenreEnrichPromptInput, z.infer<typeof genreEnrichProfileSchema>> = {
  id: "genre.enrich.profile",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: genreEnrichProfileSchema,
  render: (input) => {
    const retryInstruction = input.retry
      ? "\n你上一次没有输出合法 JSON。这一次只能返回一个 JSON 对象本体，禁止附带解释、Markdown、注释、代码块或任何额外文本。"
      : "";
    const providerJsonInstruction = input.forceJson
      ? "\n当前模型支持稳定 JSON 输出，请直接返回 JSON 对象本体。"
      : "";

    return [
      new SystemMessage([
        "你是资深网络小说题材策划专家，擅长把一个题材讲清楚、讲透，形成可直接给写作者参考的创作档案。",
        "你的任务：针对给定的一个题材，生成一份多维参考档案，帮助作者理解“这是什么题材、凭什么吸引读者、该怎么写、有哪些代表作、别踩哪些坑”。",
        "",
        "只返回一个 JSON 对象，不要输出 Markdown、解释、注释、代码块或额外文本。",
        "",
        "固定 JSON 结构（十个键，必须全部给出，键名不可改、不可增删）：",
        "{",
        '  "positioning": "题材定位：一句话说清这是什么样的书，核心标签与基调。",',
        '  "sellingPoint": "核心卖点与爽点：这题材最吸引人的地方，读者为什么会一直追读。",',
        '  "coreConflict": "核心冲突：贯穿全书的主要矛盾与张力来源。",',
        '  "readerExpectation": "读者期待：这类读者打开这本书想要的是什么，不能让他们失望的点。",',
        '  "classicStructure": "经典结构与套路：业内常见的推进方式、开篇打法和中期节奏。",',
        '  "worldSetting": "世界观与场景：故事通常发生的舞台、规则与氛围。",',
        '  "typicalCharacters": "典型角色：这类题材常见的主角类型、配角结构与关系模板。",',
        '  "pacingAdvice": "节奏建议：爽点密度、升级频率、情绪起伏如何把控。",',
        '  "representativeWorks": "代表作品与关联小说：3到6部同题材代表作，用书名号括起来，顿号分隔，作为参考。",',
        '  "commonPitfalls": "常见雷区：写这个题材最容易踩的坑、读者最反感的写法。",',
        "}",
        "",
        "内容规则：",
        "1. 每个字段都要具体、可落地，能直接当写作参考，不要写空话套话（如“内容精彩”“很有代入感”）。",
        "2. 基于真实、常见的行业认知，不要编造不存在或明显错误的代表作。",
        "3. 代表作品用真实书名，如《凡人修仙传》《遮天》；如果是小众冷门题材确实没有公认代表作，就写相近题材的代表作或明确说明“无公认代表作”。",
        "4. 定位一句话要精准，卖点、冲突、期待要讲清楚“为什么是它、读者图什么”。",
        retryInstruction,
        providerJsonInstruction,
      ].join("\n")),
      new HumanMessage([
        "请为下面这个题材生成创作参考档案：",
        "",
        `题材名称：${input.genreName}`,
        `题材路径：${input.genrePath}`,
        input.genreDescription ? `现有说明：${input.genreDescription}` : "现有说明：（无）",
      ].join("\n")),
    ];
  },
};
