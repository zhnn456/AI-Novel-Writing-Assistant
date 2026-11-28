import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { loadLockedRoomLibrary } from "../../../../services/library/lockedRoomLibrary";

/**
 * 密室诡计样本库 · 只读展示接口
 *
 * 数据来自安装包内置的 `assets/locked-room/current`（或热更新替换后的同路径）。
 * 库缺失时返回 503，前端据此显示「未安装」而不是空列表。
 */
export function registerLockedRoomRoutes(router: Router): void {
  router.get("/locked-room", (_req, res, next) => {
    try {
      const snapshot = loadLockedRoomLibrary();
      if (!snapshot.index) {
        res.status(503).json({
          success: false,
          error: "密室诡计样本库未安装或读取失败。",
        } satisfies ApiResponse<null>);
        return;
      }

      const data = {
        version: snapshot.version,
        source: snapshot.source,
        modules: snapshot.index.modules,
      };
      res.status(200).json({
        success: true,
        data,
        message: "Locked-room library loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });
}
