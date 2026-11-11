import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getLicenseEntitlement } from "@/api/license";
import { queryKeys } from "@/api/queryKeys";

/**
 * 授权状态徽标（顶栏常驻）。
 * 口径：不拦阅读、改稿、导出，只限制「生成新章节」（每本书 N 章）。
 * 只在顶栏占一个小胶囊，不再在内容区顶部压一条横幅——横幅会盖住每个页面的子导航。
 * 完整说明放在 title 提示里，点进「设置 → 授权与激活」看详情。
 */
export default function LicenseStatusBadge() {
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

  const limit = entitlement.chapterLimitPerBook ?? 3;
  const isExpired = entitlement.reason === "expired";
  const fullMessage = entitlement.tampered
    ? `检测到文件异常，已切换为体验模式（每本书 ${limit} 章），已写内容不受影响。重新安装官方版本即可恢复。`
    : isExpired
      ? `授权已到期：每本书还可体验生成 ${limit} 章，已写内容可照常修改与导出。续费后可继续不限章节。`
      : `尚未激活：每本书可体验生成 ${limit} 章，其余功能全部可用。激活后不限章节。`;
  const shortLabel = entitlement.tampered
    ? "需重新安装"
    : isExpired
      ? "已到期"
      : `体验中 · 每本 ${limit} 章`;

  return (
    <Link
      to="/settings/license"
      title={fullMessage}
      className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100"
    >
      {shortLabel}
    </Link>
  );
}
