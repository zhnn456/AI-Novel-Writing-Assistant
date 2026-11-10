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
  /** 邮箱领取 7 天试用的公开入口。 */
  trialSignupUrl: string | null;
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

/** 发送试用注册验证码到邮箱 */
export async function trialSendOtp(email: string): Promise<ApiResponse<{ sent: true }>> {
  const response = await apiClient.post<ApiResponse<{ sent: true }>>("/license/trial/send", { email });
  return response.data;
}

/** 验证邮箱验证码，成功后自动激活试用 */
export async function trialVerifyOtp(email: string, code: string): Promise<ApiResponse<LicenseStatus>> {
  const response = await apiClient.post<ApiResponse<LicenseStatus>>("/license/trial/verify", { email, code });
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

/**
 * 授权权限：full = 正式授权（章节不限）；limited = 未激活/到期/吊销，
 * 基础功能保留，每本书可再生成 3 章。传 novelId 时返回该书的已用与剩余章数。
 */
export interface LicenseEntitlement {
  mode: "full" | "limited";
  reason: "active" | "expired" | "inactive";
  chapterLimitPerBook: number | null;
  novelId: string | null;
  usedChapters: number | null;
  remainingChapters: number | null;
  planName: string | null;
  expiresAt: string | null;
  /** 程序文件完整性校验失败（安装目录被改过）：提示条会明确告知。 */
  tampered?: boolean;
}

export async function getLicenseEntitlement(novelId?: string | null): Promise<ApiResponse<LicenseEntitlement>> {
  const response = await apiClient.get<ApiResponse<LicenseEntitlement>>("/license/entitlement", {
    params: novelId ? { novelId } : undefined,
  });
  return response.data;
}
