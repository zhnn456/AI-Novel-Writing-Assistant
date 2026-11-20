import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { BUILTIN_WORLD_SAMPLES } from "../../db/builtinData";

/**
 * 内置世界样本的「已注入版本」与「用户已删除名单」。
 *
 * 为什么不建表：`AppSetting(key, value)` 已存在，两个键即可覆盖需求，
 * 避免为一次 seed 改动引入数据库迁移与回滚成本。
 */
const SEED_VERSION_KEY = "worldSample.seedVersion";
const SUPPRESSED_IDS_KEY = "worldSample.suppressedIds";

/**
 * 当前内置样本的注入版本。样本数量增加即视为新版本：
 * 老用户下次启动会补齐新增样本，已经删掉的不再复活。
 */
export const WORLD_SAMPLE_SEED_VERSION = BUILTIN_WORLD_SAMPLES.length;

const BUILTIN_SAMPLE_IDS = new Set(BUILTIN_WORLD_SAMPLES.map((sample) => sample.id));

export function isBuiltinWorldSampleId(id: string): boolean {
  return BUILTIN_SAMPLE_IDS.has(id);
}

type SettingReader = Pick<Prisma.TransactionClient, "appSetting">;

export async function readWorldSampleSeedVersion(client: SettingReader): Promise<number> {
  const row = await client.appSetting.findUnique({
    where: { key: SEED_VERSION_KEY },
    select: { value: true },
  });
  if (!row?.value) return 0;
  const parsed = Number.parseInt(row.value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export async function writeWorldSampleSeedVersion(
  client: SettingReader,
  version: number = WORLD_SAMPLE_SEED_VERSION,
): Promise<void> {
  await client.appSetting.upsert({
    where: { key: SEED_VERSION_KEY },
    create: { key: SEED_VERSION_KEY, value: String(version) },
    update: { value: String(version) },
  });
}

export async function readSuppressedWorldSampleIds(client: SettingReader): Promise<Set<string>> {
  const row = await client.appSetting.findUnique({
    where: { key: SUPPRESSED_IDS_KEY },
    select: { value: true },
  });
  if (!row?.value) return new Set();
  try {
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

/** 用户删除内置样本时登记一次，此后 seed 不再把这条补回来。 */
export async function suppressBuiltinWorldSample(id: string): Promise<void> {
  if (!isBuiltinWorldSampleId(id)) return;
  const current = await readSuppressedWorldSampleIds(prisma);
  if (current.has(id)) return;
  current.add(id);
  await prisma.appSetting.upsert({
    where: { key: SUPPRESSED_IDS_KEY },
    create: { key: SUPPRESSED_IDS_KEY, value: JSON.stringify([...current]) },
    update: { value: JSON.stringify([...current]) },
  });
}
