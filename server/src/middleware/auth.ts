import type { NextFunction, Request, Response } from "express";
import { getLicenseStatus } from "../modules/license/licenseService";

/**
 * 全局授权中间件（在路由挂载前使用）。
 *
 * 原则：
 * - 浏览类请求（GET/HEAD/OPTIONS）一律放行 —— 未激活用户也能正常浏览点击软件界面；
 * - 写操作（POST/PUT/PATCH/DELETE，即真正的生成/执行动作）必须已激活授权；
 * - 未激活 → 403 LICENSE_REQUIRED，前端据此弹出激活/付费引导。
 *
 * 授权裁决最终由 Keygate 服务端强制（激活码唯一性 / 设备数 / 吊销 / 到期）。
 */
const PUBLIC_PREFIXES = [
  "/api/health",
  "/api/license",
  "/api/account",
  "/api/feedback",
  "/api/llm", // 模型配置 / 连通性测试（配置 API 阶段，无需授权，避免设置页被误拦）
  "/api/settings", // 设置保存（配置 API / 偏好），配置阶段放行
  "/api/auto-director/channel-callbacks", // 外部渠道回调，无授权上下文
];

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const path = req.originalUrl ?? req.path ?? "";
  const method = (req.method ?? "GET").toUpperCase();

  if (PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    next();
    return;
  }
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    next();
    return;
  }

  void getLicenseStatus()
    .then((status) => {
      if (!status.activated || status.expired) {
        res.status(403).json({
          success: false,
          error: {
            code: "LICENSE_REQUIRED",
            message: "请先在「设置 → 激活授权」输入激活码完成激活，再使用生成功能。",
          },
        });
        return;
      }
      (req as Request & { license?: unknown }).license = status;
      next();
    })
    .catch(() => {
      res.status(503).json({
        success: false,
        error: { code: "LICENSE_CHECK_FAILED", message: "授权校验暂时不可用，请稍后重试。" },
      });
    });
}
