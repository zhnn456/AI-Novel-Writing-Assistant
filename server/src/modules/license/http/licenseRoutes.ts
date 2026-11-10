import { Router } from "express";
import { z } from "zod";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { validate } from "../../../middleware/validate";
import {
  activateWithCode,
  getLicenseStatus,
  trialSendOtp,
  trialVerifyOtp,
  upgradeWithCode,
} from "../licenseService";
import type { LicenseStatus } from "../licenseService";

const router = Router();

const codeSchema = z.object({
  code: z.string().trim().min(1, "请输入激活码。"),
});

/** 试用期不限章节、不限次数：额度接口恒放行，保留接口以免前端改动。 */
const UNLIMITED_QUOTA = { used: 0, limit: 0, allowed: true };

router.get("/status", async (_req, res) => {
  const data: LicenseStatus = await getLicenseStatus();
  const response: ApiResponse<LicenseStatus> = { success: true, data };
  res.json(response);
});

router.get("/quota", (_req, res) => {
  const response: ApiResponse<typeof UNLIMITED_QUOTA> = { success: true, data: UNLIMITED_QUOTA };
  res.json(response);
});

router.post("/quota", (_req, res) => {
  const response: ApiResponse<typeof UNLIMITED_QUOTA> = { success: true, data: UNLIMITED_QUOTA };
  res.json(response);
});

router.post("/activate", validate({ body: codeSchema }), async (req, res) => {
  const { code } = req.body as { code: string };
  const data: LicenseStatus = await activateWithCode(code);
  const response: ApiResponse<LicenseStatus> = {
    success: true,
    data,
    message: "激活成功。",
  };
  res.json(response);
});

router.post("/upgrade", validate({ body: codeSchema }), async (req, res) => {
  const { code } = req.body as { code: string };
  const data: LicenseStatus = await upgradeWithCode(code);
  const response: ApiResponse<LicenseStatus> = {
    success: true,
    data,
    message: "升级成功。",
  };
  res.json(response);
});

// ---- 应用内试用弹窗 ----

const emailSchema = z.object({
  email: z.string().trim().email("请输入有效的邮箱地址。"),
});

router.post("/trial/send", validate({ body: emailSchema }), async (req, res) => {
  const { email } = req.body as { email: string };
  await trialSendOtp(email);
  const response: ApiResponse<{ sent: true }> = { success: true, data: { sent: true }, message: "验证码已发送，请查收邮箱。" };
  res.json(response);
});

const verifySchema = z.object({
  email: z.string().trim().email("请输入有效的邮箱地址。"),
  code: z.string().trim().min(1, "请输入验证码。"),
});

router.post("/trial/verify", validate({ body: verifySchema }), async (req, res) => {
  const { email, code } = req.body as { email: string; code: string };
  const data: LicenseStatus = await trialVerifyOtp(email, code);
  const response: ApiResponse<LicenseStatus> = { success: true, data, message: "试用激活成功！" };
  res.json(response);
});

export default router;
