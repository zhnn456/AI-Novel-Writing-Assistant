import { Router } from "express";
import { z } from "zod";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { validate } from "../../../middleware/validate";
import {
  changePassword,
  getAccount,
  updateProfile,
  type AccountProfile,
} from "../accountService";

const router = Router();

const meSchema = z.object({
  accountId: z.string().trim().min(1, "缺少账号标识。"),
});

const profileSchema = z.object({
  accountId: z.string().trim().min(1, "缺少账号标识。"),
  nickname: z.string().trim().max(30).optional(),
  email: z.string().trim().max(120).optional(),
  avatar: z.string().max(2_000_000).optional(),
});

const passwordSchema = z.object({
  accountId: z.string().trim().min(1, "缺少账号标识。"),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6, "新密码至少 6 位。"),
});

router.get("/me", validate({ query: meSchema }), (req, res) => {
  const { accountId } = req.query as { accountId: string };
  const data: AccountProfile = getAccount(accountId);
  const response: ApiResponse<AccountProfile> = { success: true, data };
  res.json(response);
});

router.put("/profile", validate({ body: profileSchema }), (req, res) => {
  const body = req.body as z.infer<typeof profileSchema>;
  const data: AccountProfile = updateProfile(body.accountId, {
    nickname: body.nickname,
    email: body.email,
    avatar: body.avatar,
  });
  const response: ApiResponse<AccountProfile> = { success: true, data, message: "已保存。" };
  res.json(response);
});

router.post("/password", validate({ body: passwordSchema }), (req, res) => {
  const body = req.body as z.infer<typeof passwordSchema>;
  const data: AccountProfile = changePassword(body.accountId, {
    currentPassword: body.currentPassword,
    newPassword: body.newPassword,
  });
  const response: ApiResponse<AccountProfile> = { success: true, data, message: "密码已更新。" };
  res.json(response);
});

export default router;
