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

const router = Router();

const codeSchema = z.object({
  code: z.string().trim().min(1, "请输入激活码。"),
});

router.get("/status", async (_req, res) => {
  const data: LicenseStatus = await getLicenseStatus();
  const response: ApiResponse<LicenseStatus> = { success: true, data };
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
