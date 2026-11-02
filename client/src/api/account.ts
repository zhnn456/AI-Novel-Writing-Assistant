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

/** 本机稳定的账号标识：首次生成后存 localStorage。 */
export function getAccountId(): string {
  try {
    const key = "ai-novel.accountId";
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `acct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return "local-account";
  }
}

export async function getMe(accountId: string): Promise<ApiResponse<AccountProfile>> {
  const response = await apiClient.get<ApiResponse<AccountProfile>>("/account/me", {
    params: { accountId },
  });
  return response.data;
}

export async function updateProfile(
  accountId: string,
  input: { nickname?: string; email?: string; avatar?: string },
): Promise<ApiResponse<AccountProfile>> {
  const response = await apiClient.put<ApiResponse<AccountProfile>>("/account/profile", {
    accountId,
    ...input,
  });
  return response.data;
}

export async function changePassword(
  accountId: string,
  input: { currentPassword?: string; newPassword: string },
): Promise<ApiResponse<AccountProfile>> {
  const response = await apiClient.post<ApiResponse<AccountProfile>>("/account/password", {
    accountId,
    ...input,
  });
  return response.data;
}
