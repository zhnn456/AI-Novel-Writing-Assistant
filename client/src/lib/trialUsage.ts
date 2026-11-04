/**
 * 试用版额度：最多可生成 3 章（"1 部 3 章"）。
 * 计数存 localStorage（本机），用于在试用用户继续深入时弹出付费墙引导升级。
 * 高级功能的硬性门控由 licenseGate（标准版+）与服务端授权中间件兜底。
 */
const STORAGE_KEY = "ai-novel.trial.generatedCount";
export const TRIAL_GENERATION_LIMIT = 3;

export function getTrialGeneratedCount(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  } catch {
    return 0;
  }
}

export function incrementTrialGeneratedCount(): number {
  const next = getTrialGeneratedCount() + 1;
  try {
    localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function resetTrialGeneratedCount(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
