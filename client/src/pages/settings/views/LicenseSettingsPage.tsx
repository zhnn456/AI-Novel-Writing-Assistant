import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, KeyRound, Lock, Sparkles, ShieldCheck } from "lucide-react";
import {
  activateLicense,
  upgradeLicense,
  getLicenseStatus,
  type LicenseStatus,
} from "@/api/license";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SettingsShell } from "../components/SettingsShell";

const EDITION_LABEL: Record<LicenseStatus["edition"], string> = {
  none: "未授权",
  trial: "试用版",
  standard: "标准版",
  premium: "专业版",
};

const PLAN_LABEL: Record<LicenseStatus["plan"], string> = {
  trial: "试用",
  standard: "标准版",
  premium: "专业版",
};

/** 与 Keygate 后台 /admin/plans 一致的 4 档定价（价格固化到后台，此处仅展示用）。 */
const PLANS = [
  { name: "试用版", price: "¥0", unit: "7 天体验", badge: "", desc: "1 部 3 章 · 基础生成，体验完整流程", highlight: false },
  { name: "标准版 · 半年引流", price: "¥99", unit: "半年", badge: "", desc: "不限章节 + 修复/摘要/任务单/场景卡/写作公式", highlight: false },
  { name: "标准版 · 年付", price: "¥199", unit: "1 年", badge: "最受欢迎", desc: "不限章节 + 修复/摘要/任务单/场景卡/写作公式/高级反AI味", highlight: true },
  { name: "专业版 · 买断", price: "¥399", unit: "永久", badge: "", desc: "在标准版之上再加导演模式/作品分析/短剧漫画/市场雷达/创意中心", highlight: false },
];

function StatusBlock({ status }: { status: LicenseStatus }) {
  if (!status.activated) {
    return (
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" />授权状态</CardTitle>
          <CardDescription>当前未激活，可先免费试用 7 天；试用期内基础功能可用。</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            购买后把激活码（形如 KG-XXXX-XXXX-…）粘贴到下方并激活，即绑定当前这台电脑。
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!status.bound) {
    return (
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Lock className="h-4 w-4" />授权状态</CardTitle>
          <CardDescription>授权已绑定到其他设备。</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            当前这台电脑还未获得授权。请在这台电脑上输入你的激活码重新激活（一台电脑需一次激活）。
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><BadgeCheck className="h-4 w-4" />授权状态</CardTitle>
        <CardDescription>本机已激活，功能持续可用。</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{status.planName ?? EDITION_LABEL[status.edition]}</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{PLAN_LABEL[status.plan]}</span>
          <span className="text-muted-foreground">
            激活时间：{status.activatedAt ? new Date(status.activatedAt).toLocaleString() : "—"}
          </span>
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-3 border-b border-border/60 py-1.5">
            <dt className="text-muted-foreground">有效期</dt>
            <dd>
              {status.expiresAt
                ? (status.expired
                  ? <span className="text-destructive">已于 {new Date(status.expiresAt).toLocaleDateString()} 到期</span>
                  : `至 ${new Date(status.expiresAt).toLocaleDateString()}（剩 ${status.remainingDays} 天）`)
                : "永久（买断）"}
            </dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-border/60 py-1.5">
            <dt className="text-muted-foreground">售价</dt>
            <dd>{status.price != null ? `¥ ${status.price}` : "—"}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

export default function LicenseSettingsPage() {
  const queryClient = useQueryClient();
  const [activateCode, setActivateCode] = useState("");
  const [result, setResult] = useState("");

  const statusQuery = useQuery({
    queryKey: queryKeys.settings.license,
    queryFn: getLicenseStatus,
  });
  const status = statusQuery.data?.data;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.settings.license });

  const activateMutation = useMutation({
    mutationFn: activateLicense,
    onSuccess: async (response) => {
      setResult(response.message ?? "激活成功。");
      setActivateCode("");
      await invalidate();
    },
    onError: (error) => {
      setResult(error instanceof Error ? error.message : "激活失败。");
    },
  });

  const upgradeMutation = useMutation({
    mutationFn: upgradeLicense,
    onSuccess: async (response) => {
      setResult(response.message ?? "已切换到新版授权。");
      setActivateCode("");
      await invalidate();
    },
    onError: (error) => {
      setResult(error instanceof Error ? error.message : "切换失败。");
    },
  });

  return (
    <SettingsShell title="授权与激活" description="查看授权状态，填入激活码完成激活；升级版本时用新激活码重新激活即可，无需重装。">
      {status ? <StatusBlock status={status} /> : null}

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" />激活 / 更换激活码</CardTitle>
          <CardDescription>填入购买后收到的激活码（形如 KG-XXXX-XXXX-XXXX-XXXX），在线校验并绑定当前这台电脑。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              value={activateCode}
              onChange={(event) => setActivateCode(event.target.value)}
              placeholder="粘贴激活码（KG-…）"
              className="sm:max-w-md"
            />
            <div className="flex shrink-0 gap-2">
              <Button
                onClick={() => activateMutation.mutate(activateCode.trim())}
                disabled={!activateCode.trim() || activateMutation.isPending}
              >
                {activateMutation.isPending ? "激活中..." : "激活"}
              </Button>
              <Button
                variant="outline"
                onClick={() => upgradeMutation.mutate(activateCode.trim())}
                disabled={!activateCode.trim() || upgradeMutation.isPending}
              >
                {upgradeMutation.isPending ? "切换中..." : "升级/换码"}
              </Button>
            </div>
          </div>
          {result ? <p className="mt-3 text-sm text-muted-foreground">{result}</p> : null}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" />套餐与定价</CardTitle>
          <CardDescription>价格已固化在授权后台，此处仅供购买前了解档位与功能边界。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  "relative rounded-xl border p-4",
                  plan.highlight ? "border-primary/60 bg-primary/5" : "border-border",
                )}
              >
                {plan.badge ? (
                  <span className="absolute -top-2 right-3 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                    {plan.badge}
                  </span>
                ) : null}
                <p className="text-sm font-medium">{plan.name}</p>
                <p className="mt-1 text-2xl font-semibold">{plan.price}<span className="ml-1 text-xs font-normal text-muted-foreground">{plan.unit}</span></p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{plan.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" />说明</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>授权采用在线校验（Keygate 授权服务）：可随时吊销泄露的码、支持订阅到期、限制一台设备绑定数量。</li>
            <li>激活码与设备绑定；换设备后需在新设备上重新激活。</li>
            <li>试用版（7 天）可用于完整体验基础流程；跑完试用额度后需升级为标准版 / 专业版继续使用高级功能。</li>
            <li>购买与获取激活码请通过官方下载页 / 客服联系卖家。</li>
          </ul>
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
