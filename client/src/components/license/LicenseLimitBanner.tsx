import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getLicenseEntitlement } from "@/api/license";
import { queryKeys } from "@/api/queryKeys";

/**
 * 授权受限提示条：未激活 / 已到期 / 已被吊销时常驻显示。
 * 口径：不拦阅读、改稿、导出，只限制「生成新章节」（每本书 3 章）。
 */
export default function LicenseLimitBanner() {
  const entitlementQuery = useQuery({
    queryKey: queryKeys.settings.licenseEntitlement(null),
    queryFn: () => getLicenseEntitlement(null),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const entitlement = entitlementQuery.data?.data;
  if (!entitlement || entitlement.mode === "full") {
    return null;
  }

  const isExpired = entitlement.reason === "expired";
  const message = entitlement.tampered
    ? "检测到程序文件被修改：已临时降级为体验模式（每本书 3 章），已写内容不受影响。请使用官方安装包重新安装后再试。"
    : isExpired
      ? "授权已到期：每本书还可体验生成 3 章，已写内容可照常修改与导出。续费后可继续不限章节。"
      : "尚未激活：每本书可体验生成 3 章，其余功能全部可用。激活后不限章节。";

  return (
    <div
      className="sticky top-0 z-20 -mx-6 -mt-6 mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-900"
      role="status"
    >
      <span>{message}</span>
      <Link
        to="/settings/license"
        className="shrink-0 rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100"
      >
        去激活
      </Link>
    </div>
  );
}
