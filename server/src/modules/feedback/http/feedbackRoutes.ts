import { Router } from "express";
import { z } from "zod";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { validate } from "../../../middleware/validate";
import {
  addFeedback,
  listAll,
  listByAccount,
  replyTo,
  type FeedbackMessage,
} from "../feedbackService";

const router = Router();

/** 管理员回复需要的口令，来自环境变量 FEEDBACK_ADMIN_TOKEN（未设置则管理员接口不可用）。 */
const ADMIN_TOKEN = process.env.FEEDBACK_ADMIN_TOKEN || "";

const submitSchema = z.object({
  accountId: z.string().trim().min(1, "缺少账号标识。"),
  type: z.enum(["suggestion", "bug", "feedback"]),
  content: z.string().trim().min(1, "请填写留言内容。").max(5000),
  contact: z.string().trim().max(120).optional(),
});

const listSchema = z.object({
  accountId: z.string().trim().min(1, "缺少账号标识。"),
});

const replySchema = z.object({
  reply: z.string().trim().min(1, "请填写回复内容。"),
});

/** 用户提交留言 */
router.post("/", validate({ body: submitSchema }), (req, res) => {
  const body = req.body as z.infer<typeof submitSchema>;
  const data: FeedbackMessage = addFeedback(body.accountId, {
    type: body.type,
    content: body.content,
    contact: body.contact,
  });
  const response: ApiResponse<FeedbackMessage> = {
    success: true,
    data,
    message: "已收到，我们会尽快处理。",
  };
  res.json(response);
});

/** 用户查看自己的留言与回复 */
router.get("/", validate({ query: listSchema }), (req, res) => {
  const { accountId } = req.query as { accountId: string };
  const data: FeedbackMessage[] = listByAccount(accountId);
  const response: ApiResponse<FeedbackMessage[]> = { success: true, data };
  res.json(response);
});

/** 管理员：查看全部留言 */
router.get("/admin", (_req, res) => {
  if (!ADMIN_TOKEN) {
    const response: ApiResponse<null> = {
      success: false,
      error: "管理员口令未配置（FEEDBACK_ADMIN_TOKEN）。",
    };
    return res.status(500).json(response);
  }
  if (_req.header("x-admin-token") !== ADMIN_TOKEN) {
    const response: ApiResponse<null> = { success: false, error: "管理员口令不正确。" };
    return res.status(401).json(response);
  }
  const data: FeedbackMessage[] = listAll();
  const response: ApiResponse<FeedbackMessage[]> = { success: true, data };
  res.json(response);
});

/** 管理员：回复留言 */
router.post("/admin/:id/reply", validate({ body: replySchema }), (req, res) => {
  if (!ADMIN_TOKEN) {
    const response: ApiResponse<null> = {
      success: false,
      error: "管理员口令未配置（FEEDBACK_ADMIN_TOKEN）。",
    };
    return res.status(500).json(response);
  }
  if (req.header("x-admin-token") !== ADMIN_TOKEN) {
    const response: ApiResponse<null> = { success: false, error: "管理员口令不正确。" };
    return res.status(401).json(response);
  }
  const body = req.body as z.infer<typeof replySchema>;
  const data: FeedbackMessage = replyTo(req.params.id, body.reply);
  const response: ApiResponse<FeedbackMessage> = { success: true, data, message: "已回复。" };
  res.json(response);
});

export default router;
