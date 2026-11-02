import type { ApiResponse } from "@ai-novel/shared/types/api";
import { apiClient } from "./client";

export type FeedbackType = "suggestion" | "bug" | "feedback";

export interface FeedbackMessage {
  id: string;
  accountId: string;
  type: FeedbackType;
  content: string;
  contact: string;
  status: "open" | "replied";
  reply: string;
  createdAt: string;
  repliedAt: string | null;
}

export async function submitFeedback(
  accountId: string,
  input: { type: FeedbackType; content: string; contact?: string },
): Promise<ApiResponse<FeedbackMessage>> {
  const response = await apiClient.post<ApiResponse<FeedbackMessage>>("/feedback", {
    accountId,
    ...input,
  });
  return response.data;
}

export async function getMyFeedback(accountId: string): Promise<ApiResponse<FeedbackMessage[]>> {
  const response = await apiClient.get<ApiResponse<FeedbackMessage[]>>("/feedback", {
    params: { accountId },
  });
  return response.data;
}
