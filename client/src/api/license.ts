import type { ApiResponse } from "@ai-novel/shared/types/api";
import { apiClient } from "./client";

export type LicensePlan = "trial" | "standard" | "premium";

export interface LicenseStatus {
  activated: boolean;
  /** 是否绑定到当前这台机器。 */
  bound: boolean;
  edition: "none" | "standard" | "premium";
  machineFingerprint: string;
  activatedAt: string | null;
  plan: LicensePlan;
  /** 到期时间；null 表示永久有效（买断）。 */
  expiresAt: string | null;
  /** 剩余有效天数；null 表示永久。 */
  remainingDays: number | null;
  /** 是否已过期。 */
  expired: boolean;
  /** 售价（元）。 */
  price: number | null;
}

export async function getLicenseStatus(): Promise<ApiResponse<LicenseStatus>> {
  const response = await apiClient.get<ApiResponse<LicenseStatus>>("/license/status");
  return response.data;
}

export async function activateLicense(code: string): Promise<ApiResponse<LicenseStatus>> {
  const response = await apiClient.post<ApiResponse<LicenseStatus>>("/license/activate", { code });
  return response.data;
}

export async function upgradeLicense(code: string): Promise<ApiResponse<LicenseStatus>> {
  const response = await apiClient.post<ApiResponse<LicenseStatus>>("/license/upgrade", { code });
  return response.data;
}
