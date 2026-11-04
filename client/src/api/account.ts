import type { ApiResponse } from "@ai-novel/shared/types/api";
import { apiClient } from "./client";

export interface AccountProfile {
  accountId: string;
  nickname: string;
  email: string;
  avatar: string;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 账号读写统一由服务端解析为本机账号（见 server accountService），
 * 客户端不再生成/传参 accountId —— 杜绝越权访问他人资料。
 */
export async function getMe(): Promise<ApiResponse<AccountProfile>> {
  const response = await apiClient.get<ApiResponse<AccountProfile>>("/account/me");
  return response.data;
}

export async function updateProfile(
  input: { nickname?: string; email?: string; avatar?: string },
): Promise<ApiResponse<AccountProfile>> {
  const response = await apiClient.put<ApiResponse<AccountProfile>>("/account/profile", input);
  return response.data;
}

export async function changePassword(
  input: { currentPassword?: string; newPassword: string },
): Promise<ApiResponse<AccountProfile>> {
  const response = await apiClient.post<ApiResponse<AccountProfile>>("/account/password", input);
  return response.data;
}
