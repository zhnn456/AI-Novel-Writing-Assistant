import type { ApiResponse } from "@ai-novel/shared/types/api";
import { apiClient } from "./client";

export type LicensePlan = "trial" | "standard" | "premium";
export type LicenseEdition = "none" | LicensePlan;

export interface LicenseStatus {
  activated: boolean;
  /** 是否绑定到当前这台机器。 */
  bound: boolean;
  edition: LicenseEdition;
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
  /** Keygate 套餐名（后台配置）。 */
  planName: string | null;
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

export interface LicenseQuota {
  used: number;
  limit: number;
  allowed: boolean;
}

/** 读取本机已用额度（由本地服务端保管，不依赖浏览器存储）。 */
export async function getLicenseQuota(): Promise<ApiResponse<LicenseQuota>> {
  const response = await apiClient.get<ApiResponse<LicenseQuota>>("/license/quota");
  return response.data;
}

/** 占用一次额度；超限时 allowed 为 false。 */
export async function consumeLicenseQuota(): Promise<ApiResponse<LicenseQuota>> {
  const response = await apiClient.post<ApiResponse<LicenseQuota>>("/license/quota", {});
  return response.data;
}
