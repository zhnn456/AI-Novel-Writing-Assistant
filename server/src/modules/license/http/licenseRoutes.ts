import { Router } from "express";
import { z } from "zod";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { validate } from "../../../middleware/validate";
import {
  activateWithCode,
  getLicenseStatus,
  upgradeWithCode,
} from "../licenseService";
import type { LicenseStatus } from "../licenseService";
import { consumeQuota, readQuota } from "../stateStore";

const router = Router();

/** 体验版可用生成次数上限，与界面文案保持一致。 */
const QUOTA_LIMIT = 3;

const codeSchema = z.object({
  code: z.string().trim().min(1, "请输入激活码。"),
});

router.get("/status", async (_req, res) => {
  const data: LicenseStatus = await getLicenseStatus();
  const response: ApiResponse<LicenseStatus> = { success: true, data };
  res.json(response);
});

// 体验额度的读/占：计数落在服务端的加密状态里，不依赖浏览器存储。
router.get("/quota", async (_req, res) => {
  const data = readQuota(QUOTA_LIMIT);
  const response: ApiResponse<typeof data> = { success: true, data };
  res.json(response);
});

router.post("/quota", async (_req, res) => {
  const status = await getLicenseStatus();
  if (status.edition !== "trial") {
    // 非体验版不占用额度
    const data = { used: 0, limit: QUOTA_LIMIT, allowed: true };
    const response: ApiResponse<typeof data> = { success: true, data };
    res.json(response);
    return;
  }
  const data = consumeQuota(QUOTA_LIMIT);
  const response: ApiResponse<typeof data> = { success: true, data };
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

export default router;
