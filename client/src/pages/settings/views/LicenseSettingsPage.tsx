import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, KeyRound, Lock, Sparkles } from "lucide-react";
import {
  activateLicense,
  getLicenseStatus,
  upgradeLicense,
  type LicenseStatus,
} from "@/api/license";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SettingsShell } from "../components/SettingsShell";

const EDITION_LABEL: Record<LicenseStatus["edition"], string> = {
  none: "未授权",
  standard: "标准版",
  premium: "高级版",
};

const PLAN_LABEL: Record<LicenseStatus["plan"], string> = {
  trial: "试用",
  standard: "标准版",
  premium: "高级版",
};

function StatusBlock({ status }: { status: LicenseStatus }) {
  if (!status.activated) {
    return (
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" />授权状态</CardTitle>
          <CardDescription>当前为试用状态，现有功能均可用。</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            填入授权激活码后完成激活。授权只绑定当前这台电脑，不联网、不依赖账号。
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
            当前这台电脑还未获得授权，无法读取原设备的激活记录。请在这台电脑上重新激活。
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
          <span className="font-medium">{EDITION_LABEL[status.edition]}</span>
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
  const [upgradeCode, setUpgradeCode] = useState("");
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
      setResult(response.message ?? "升级成功。");
      setUpgradeCode("");
      await invalidate();
    },
    onError: (error) => {
      setResult(error instanceof Error ? error.message : "升级失败。");
    },
  });

  return (
    <SettingsShell title="授权与激活" description="查看授权状态，填入授权激活码完成激活，或用升级码随时解锁更高级别。">
      {status ? <StatusBlock status={status} /> : null}

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" />激活</CardTitle>
          <CardDescription>填写你购买的授权激活码，绑定当前这台电脑。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              value={activateCode}
              onChange={(event) => setActivateCode(event.target.value)}
              placeholder="粘贴授权激活码"
              className="sm:max-w-md"
            />
            <Button
              onClick={() => activateMutation.mutate(activateCode.trim())}
              disabled={!activateCode.trim() || activateMutation.isPending}
              className="shrink-0"
            >
              {activateMutation.isPending ? "激活中..." : "激活"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" />升级</CardTitle>
          <CardDescription>持续更新或升级到高级版时，在这里输入升级码即可解锁，不需要重装。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              value={upgradeCode}
              onChange={(event) => setUpgradeCode(event.target.value)}
              placeholder="粘贴升级码"
              className="sm:max-w-md"
            />
            <Button
              variant="outline"
              onClick={() => upgradeMutation.mutate(upgradeCode.trim())}
              disabled={!upgradeCode.trim() || upgradeMutation.isPending}
              className="shrink-0"
            >
              {upgradeMutation.isPending ? "升级中..." : "升级为高级版"}
            </Button>
          </div>
          {result ? <p className="mt-3 text-sm text-muted-foreground">{result}</p> : null}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Lock className="h-4 w-4" />说明</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>授权采用在线校验：激活时与授权服务器核对，可随时吊销泄露的码、支持订阅；断网时使用最近一次通过的授权结果。</li>
            <li>激活码与当前这台电脑绑定，换设备后需在新设备上重新激活。</li>
            <li>本次版本不限制任何功能；后续版本如需分级，会在发布说明中说明对应档位。</li>
          </ul>
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
