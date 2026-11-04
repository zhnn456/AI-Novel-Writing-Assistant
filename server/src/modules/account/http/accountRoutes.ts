import { Router } from "express";
import { z } from "zod";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { validate } from "../../../middleware/validate";
import {
  changePassword,
  getAccount,
  updateProfile,
  type PublicAccountProfile,
} from "../accountService";

/**
 * 个人中心账号路由。
 * 越权漏洞修复：不再接受客户端传入的任意 accountId；
 * 账号一律由服务端解析为本机账号（见 accountService.resolveLocalAccountId）。
 */
const router = Router();

const profileSchema = z.object({
  nickname: z.string().trim().max(30).optional(),
  email: z.string().trim().max(120).optional(),
  avatar: z.string().max(2_000_000).optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6, "新密码至少 6 位。"),
});

router.get("/me", (_req, res) => {
  const data: PublicAccountProfile = getAccount();
  const response: ApiResponse<PublicAccountProfile> = { success: true, data };
  res.json(response);
});

router.put("/profile", validate({ body: profileSchema }), (req, res) => {
  const body = req.body as z.infer<typeof profileSchema>;
  const data: PublicAccountProfile = updateProfile({
    nickname: body.nickname,
    email: body.email,
    avatar: body.avatar,
  });
  const response: ApiResponse<PublicAccountProfile> = { success: true, data, message: "已保存。" };
  res.json(response);
});

router.post("/password", validate({ body: passwordSchema }), (req, res) => {
  const body = req.body as z.infer<typeof passwordSchema>;
  const data: PublicAccountProfile = changePassword({
    currentPassword: body.currentPassword,
    newPassword: body.newPassword,
  });
  const response: ApiResponse<PublicAccountProfile> = { success: true, data, message: "密码已更新。" };
  res.json(response);
});

export default router;
