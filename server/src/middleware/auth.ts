import type { NextFunction, Request, Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { getLicenseStatus } from "../modules/license/licenseService";
import { isLicenseTestBypassEnabled } from "../modules/license/entitlement";

/**
 * 全局鉴权中间件（在路由挂载前使用），串行执行两道闸门：
 *
 * 第一道：远程访问令牌（上游 v0.7.5+）
 *  - 仅当配置了 AI_NOVEL_ACCESS_TOKEN 时启用；未配置则保持原有的开放行为（本机桌面模式）。
 *  - 命中后校验 Authorization: Bearer 或 ai_novel_access Cookie，失败 → 401。
 *
 * 第二道：授权门禁（我方商业化改造）
 *  - 浏览类请求（GET/HEAD/OPTIONS）一律放行 —— 未激活用户也能正常浏览界面；
 *  - 写操作（POST/PUT/PATCH/DELETE，即真正的生成/执行动作）必须已激活授权；
 *  - 未激活 → 403 LICENSE_REQUIRED，前端据此弹出激活/付费引导；
 *  - 自动化测试进程（node --test、非桌面成品）走旁路，见 isLicenseTestBypassEnabled。
 *
 * 授权裁决最终由 Keygate 服务端强制（激活码唯一性 / 设备数 / 吊销 / 到期）。
 */
const COOKIE_NAME = "ai_novel_access";
const publicRequests = new Set([
  "GET /api/health", "GET /api/health/",
  "POST /api/auto-director/channel-callbacks/dingtalk",
  "POST /api/auto-director/channel-callbacks/wecom",
  "GET /api/auto-director/channel-callbacks/dingtalk/execute",
  "GET /api/auto-director/channel-callbacks/wecom/execute",
]);

const PUBLIC_PREFIXES = [
  "/api/health",
  "/api/license",
  "/api/account",
  "/api/feedback",
  "/api/llm", // 模型配置 / 连通性测试（配置 API 阶段，无需授权，避免设置页被误拦）
  "/api/settings", // 设置保存（配置 API / 偏好），配置阶段放行
  "/api/auto-director/channel-callbacks", // 外部渠道回调，无授权上下文
  "/api/novel-workflows/bootstrap", // 开书初始化，读取状态，不产生内容
  "/api/novel-workflows/sync-stage", // 章节阶段状态同步，读取/写入本地状态
];

function cookieToken(req: Request): string {
  const value = req.headers.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith(`${COOKIE_NAME}=`));
  try { return value ? decodeURIComponent(value.slice(COOKIE_NAME.length + 1)) : ""; } catch { return ""; }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const pathname = (req.originalUrl ?? req.path ?? "").split("?")[0].replace(/\/$/, "");

  // —— 第一道：远程访问令牌（可选，上游能力）——
  if (!publicRequests.has(`${req.method} ${pathname}`)) {
    const expected = process.env.AI_NOVEL_ACCESS_TOKEN?.trim();
    // Access protection is opt-in: without a configured token the API keeps its previous open behavior.
    if (expected) {
      const authorization = req.get("authorization");
      const token = authorization ? /^Bearer (.+)$/i.exec(authorization)?.[1] ?? "" : cookieToken(req);
      const digest = (value: string) => createHash("sha256").update(value).digest();
      if (!token || !timingSafeEqual(digest(token), digest(expected))) {
        res.status(401).json({ success: false, code: "ACCESS_TOKEN_REQUIRED", error: "请输入有效的访问令牌。" });
        return;
      }
    }
  }

  // —— 第二道：授权门禁（我方商业化规则）——
  if (isLicenseTestBypassEnabled()) {
    next();
    return;
  }
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

/** Browser sessions keep credentials out of URLs and support native EventSource. */
export function establishAccessSession(req: Request, res: Response): void {
  const token = process.env.AI_NOVEL_ACCESS_TOKEN?.trim();
  if (token) res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: "strict", secure: req.secure, path: "/api" });
  res.setHeader("Cache-Control", "no-store");
  res.json({ success: true });
}
