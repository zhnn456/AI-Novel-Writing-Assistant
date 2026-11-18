import axios, { AxiosError } from "axios";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { API_BASE_URL, API_TIMEOUT_MS } from "@/lib/constants";
import { toast } from "@/components/ui/toast";
import {shouldToastApiError} from "@/lib/apiErrors";

export interface ApiHttpError extends Error {
  status?: number;
  details?: unknown;
  code?: string;
  requestId?: string;
}

declare module "axios" {
  interface AxiosRequestConfig {
    silentErrorStatuses?: number[];
    errorPresentation?: "toast" | "inline";
  }
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  withCredentials: true,
});

const AUTO_DISMISS_SERVER_ERROR_TOAST = {
  duration: 4000,
  closeButton: false,
} as const;

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiResponse<unknown>>) => {
    function normalizeString(value: unknown): string | undefined {
      if (typeof value === "string" && value.trim().length > 0) return value;
      if (value && typeof value === "object") {
        const record = value as { message?: unknown; code?: unknown };
        if (typeof record.message === "string" && record.message.trim().length > 0) return record.message;
        if (typeof record.code === "string" && record.code.trim().length > 0) return record.code;
      }
      return undefined;
    }
    const status = error.response?.status;
    if (status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event("ai-novel:access-required"));
    const backendError = normalizeString(error.response?.data?.error);
    const backendMessage = normalizeString(error.response?.data?.message);
    const silentErrorStatuses = error.config?.silentErrorStatuses ?? [];
    const source = error.response?.data as (ApiResponse<unknown> & {sourceRoute?: unknown; sourceActionLabel?: unknown}) | undefined;
    const sourceRoute = typeof source?.sourceRoute === "string" && /^\/(?!\/)/.test(source.sourceRoute) ? source.sourceRoute : null;
    const sourceAction = status === 409 && sourceRoute ? {label: typeof source?.sourceActionLabel === "string" ? source.sourceActionLabel : "打开创作页面", onClick: () => window.location.assign(sourceRoute)} : undefined;
    let title = backendError ?? error.message ?? "请求失败。";
    let description = backendMessage && backendMessage !== backendError ? backendMessage : undefined;

    if (!status) {
      title = "网络连接失败，请检查网络后重试。";
      description = undefined;
    } else if (status >= 500) {
      title = backendError ?? "服务器错误，请稍后重试。";
      description = backendMessage && backendMessage !== title ? backendMessage : undefined;
    } else if (status === 403 && error.response?.data?.error === "LICENSE_REQUIRED") {
      // 未激活时的写操作拦截：直接告诉用户去哪儿拿授权，别让英文错误码糊在脸上。
      title = "需要激活后才能创作";
      description = "到「设置 → 授权与激活」点「免费领取 7 天试用」，填邮箱收授权码后粘贴激活即可，全部功能开放。";
    } else if (status === 403 && error.response?.data?.code === "LICENSE_CHAPTER_LIMIT") {
      // 体验额度用完：保留用户的稿子，只说明「生成」停在哪、怎么继续。
      title = backendError ?? "本书的体验额度已用完";
      description = "到「设置 → 授权与激活」激活后可继续生成；已写的章节仍可正常修改和导出。";
    }

    if (shouldToastApiError(error.config ?? {}, status)) {
      const isGenericServerErrorToast = title === "服务器错误，请稍后重试。";

      if (sourceAction) {
        toast.error(title, {description, action: sourceAction});
      } else if (description) {
        toast.error(
          title,
          isGenericServerErrorToast
            ? {
                description,
                ...AUTO_DISMISS_SERVER_ERROR_TOAST,
              }
            : { description },
        );
      } else {
        toast.error(title, isGenericServerErrorToast ? AUTO_DISMISS_SERVER_ERROR_TOAST : undefined);
      }
    }

    const message = description ? `${title} ${description}` : title;

    const normalizedError = new Error(
      message,
    ) as ApiHttpError;
    normalizedError.status = status;
    normalizedError.details = error.response?.data;
    normalizedError.code = error.response?.data?.code;
    normalizedError.requestId = error.response?.data?.requestId;
    return Promise.reject(normalizedError);
  },
);
