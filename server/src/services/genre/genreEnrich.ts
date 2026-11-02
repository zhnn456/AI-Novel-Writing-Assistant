import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { resolveLLMClientOptions } from "../../llm/factory";
import { selectStructuredOutputStrategy } from "../../llm/structuredOutput";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { genreEnrichPrompt } from "../../prompting/prompts/genre/genre.prompts";
import { genreEnrichProfileSchema, type GenreEnrichProfile } from "../../prompting/prompts/genre/genre.promptSchemas";

export interface GenreEnrichOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GenreEnrichResult {
  id: string;
  name: string;
  profileJson: string;
}

export interface GenreEnrichOutcome {
  enriched: GenreEnrichResult[];
  failed: { id: string; name: string; error: string }[];
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function sanitizeGenreEnrichProfile(value: unknown): GenreEnrichProfile {
  if (!value || typeof value !== "object") {
    throw new Error("模型输出异常：题材丰富档案不是合法对象。");
  }
  const record = value as Record<string, unknown>;
  const out = genreEnrichProfileSchema.safeParse(record);
  if (!out.success) {
    throw new Error("模型输出异常：题材丰富档案缺少必要字段。");
  }
  return out.data;
}

async function shouldForceGenreEnrichJson(input: GenreEnrichOptions): Promise<boolean> {
  const resolved = await resolveLLMClientOptions(input.provider ?? "deepseek", {
    model: input.model,
    temperature: input.temperature ?? 0.55,
    maxTokens: input.maxTokens,
    taskType: genreEnrichPrompt.taskType,
    executionMode: "structured",
  });
  const profile = resolved.structuredProfile;
  if (!profile || !genreEnrichPrompt.outputSchema) {
    return false;
  }
  return selectStructuredOutputStrategy(profile, genreEnrichPrompt.outputSchema) !== "prompt_json";
}

export async function enrichGenres(genreIds: string[] | null, options: GenreEnrichOptions): Promise<GenreEnrichOutcome> {
  const where = genreIds && genreIds.length ? { id: { in: genreIds } } : {};
  const genres = await prisma.novelGenre.findMany({
    where,
    select: {
      id: true,
      name: true,
      description: true,
      parent: { select: { name: true } },
    },
    orderBy: [{ parent: { name: "asc" } }, { name: "asc" }],
  });

  if (!genres.length) {
    throw new Error("没有可丰富的题材基底。");
  }

  const forceJson = await shouldForceGenreEnrichJson(options);
  const enriched: GenreEnrichResult[] = [];
  const failed: GenreEnrichOutcome["failed"] = [];

  for (const genre of genres) {
    const genrePath = genre.parent ? `${genre.parent.name} / ${genre.name}` : genre.name;
    try {
      let result;
      for (const retry of [false, true]) {
        try {
          result = await runStructuredPrompt({
            asset: genreEnrichPrompt,
            promptInput: {
              genreName: genre.name,
              genreDescription: genre.description ?? "",
              genrePath,
              retry,
              forceJson,
            },
            options: {
              provider: options.provider,
              model: options.model,
              temperature: options.temperature ?? 0.55,
              maxTokens: options.maxTokens,
            },
          });
          break;
        } catch (error) {
          if (retry) {
            throw error;
          }
        }
      }
      const profile = sanitizeGenreEnrichProfile(result?.output);
      const profileJson = JSON.stringify(profile);
      await prisma.novelGenre.update({
        where: { id: genre.id },
        data: { profileJson },
      });
      enriched.push({ id: genre.id, name: genre.name, profileJson });
    } catch (error) {
      failed.push({
        id: genre.id,
        name: genre.name,
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  return { enriched, failed };
}

export function parseGenreEnrichProfile(profileJson: string | null | undefined): GenreEnrichProfile {
  if (!profileJson) {
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
  try {
    const parsed = JSON.parse(profileJson) as unknown;
    return sanitizeGenreEnrichProfile(parsed);
  } catch {
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
}
