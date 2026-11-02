import { z } from "zod";

export const genreTreeDraftNodeSchema = z
  .object({
    name: z.string().trim().min(1),
    description: z.string().trim().optional(),
    // children 会在 sanitize 阶段进一步递归归一化
    children: z.array(z.unknown()).optional(),
  })
  .passthrough();

export type GenreTreeDraftNode = z.infer<typeof genreTreeDraftNodeSchema>;

export const genreEnrichProfileSchema = z
  .object({
    positioning: z.string().trim().min(1),
    sellingPoint: z.string().trim().min(1),
    coreConflict: z.string().trim().min(1),
    readerExpectation: z.string().trim().min(1),
    classicStructure: z.string().trim().min(1),
    worldSetting: z.string().trim().min(1),
    typicalCharacters: z.string().trim().min(1),
    pacingAdvice: z.string().trim().min(1),
    representativeWorks: z.string().trim().min(1),
    commonPitfalls: z.string().trim().min(1),
  })
  .passthrough();

export type GenreEnrichProfile = z.infer<typeof genreEnrichProfileSchema>;
