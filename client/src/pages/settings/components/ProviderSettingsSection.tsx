import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Plus, PlugZap, RefreshCw, ServerCog, Sparkles } from "lucide-react";
import type { LLMProvider, ReasoningEffort } from "@ai-novel/shared/types/llm";
import {
  getModelDirectoryMeta,
  refreshModelDirectory,
  type APIKeyStatus,
  type ModelDirectoryMeta,
  type ProviderBalanceStatus,
} from "@/api/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";
import { cn } from "@/lib/utils";
import { openDesktopExternal } from "@/lib/desktop";
import ProviderStatusCard, { type ProviderCardViewModel } from "./ProviderStatusCard";

const XINGCHEN_DISPLAY_NAME = "星辰AI";
const XINGCHEN_BASE_URL = "https://api.lk888.ai/v1";
/** 星辰AI 注册页：带邀请参数，务必用系统浏览器打开（站点的登录/支付在自己的域名下才正常）。 */
const XINGCHEN_REGISTER_URL = "https://xcai.dpdns.org?yonghu=190J4H9V79H5APU0";

export default function ProviderSettingsSection(props: {
  embedded?: boolean;
  providers: APIKeyStatus[];
  balances: ProviderBalanceStatus[];
  isBalanceLoading: boolean;
  testingProvider?: string;
  providerTestResults: Record<string, string>;
  refreshingModelProvider?: string;
  refreshingBalanceProvider?: string;
  reasoningProvider?: string;
  onCreateCustomProvider: (initial?: { displayName?: string; baseURL?: string }) => void;
  onRemoveProvider: (provider: APIKeyStatus) => void;
  onOpenConfig: (provider: LLMProvider) => void;
  onTest: (provider: APIKeyStatus) => void;
  onRefreshModels: (provider: LLMProvider) => void;
  onRefreshBalance: (provider: LLMProvider) => void;
  onSetReasoning: (provider: LLMProvider, reasoningEnabled: boolean, reasoningEffort?: ReasoningEffort) => void;
  onSetHiddenModels: (provider: LLMProvider, hiddenModels: string[], message: string) => void;
  removingProvider?: string;
}) {
  const {
    embedded = false,
    providers,
    balances,
    isBalanceLoading,
    testingProvider,
    providerTestResults,
    refreshingModelProvider,
    refreshingBalanceProvider,
    reasoningProvider,
    onCreateCustomProvider,
    onRemoveProvider,
    onOpenConfig,
    onTest,
    onRefreshModels,
    onRefreshBalance,
    onSetReasoning,
    onSetHiddenModels,
    removingProvider,
  } = props;
  const [isAddProviderOpen, setIsAddProviderOpen] = useState(false);
  const [directoryMeta, setDirectoryMeta] = useState<ModelDirectoryMeta | null>(null);
  const [isDirectorySyncing, setIsDirectorySyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getModelDirectoryMeta()
      .then((response) => {
        if (!cancelled) setDirectoryMeta(response.data ?? null);
      })
      .catch(() => {
        // 目录状态只是提示，拉不到就不显示，不打扰用户。
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const syncDirectory = async () => {
    setIsDirectorySyncing(true);
    try {
      const response = await refreshModelDirectory();
      setDirectoryMeta(response.data ?? null);
    } catch {
      // 同步失败保留旧状态，界面继续显示上次更新时间。
    } finally {
      setIsDirectorySyncing(false);
    }
  };
  const balanceMap = new Map(balances.map((item) => [item.provider, item]));
  const viewModels: ProviderCardViewModel[] = providers.map((provider) => {
    const balance = balanceMap.get(provider.provider);
    const canRefreshBalance = Boolean(
      provider.kind === "builtin"
      && provider.isConfigured
      && (balance?.canRefresh ?? (provider.provider === "deepseek" || provider.provider === "siliconflow" || provider.provider === "kimi")),
    );
    return {
      provider,
      balance,
      isBalanceLoading: isBalanceLoading && !balance,
      isBalanceRefreshing: refreshingBalanceProvider === provider.provider,
      canRefreshBalance,
      isReasoningUpdating: reasoningProvider === provider.provider,
      isTesting: testingProvider === provider.provider,
      testResult: providerTestResults[provider.provider],
    };
  });
  const visibleViewModels = useMemo(
    () => viewModels.filter(({ provider }) => provider.isConfigured && provider.isActive),
    [viewModels],
  );
  const addableBuiltIns = providers.filter((provider) => provider.kind === "builtin" && (!provider.isConfigured || !provider.isActive));

  return (
    <Card
      id={embedded ? undefined : "settings-provider-section"}
      className={cn(
        "min-w-0 scroll-mt-20 overflow-hidden",
        embedded ? "border-0 bg-transparent shadow-none" : "border-primary/10 bg-gradient-to-b from-primary/[0.035] to-background shadow-sm",
      )}
    >
      <CardHeader className={cn("flex flex-col gap-4 border-b bg-background/60 sm:flex-row sm:items-start sm:justify-between", embedded && "bg-transparent px-0 pt-0")}>
        <div className="flex min-w-0 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>模型厂商</CardTitle>
              <Badge variant={visibleViewModels.length ? "default" : "outline"}>{visibleViewModels.length} 个可用连接</Badge>
            </div>
          <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>
              添加一个可用文本模型后就能开始创作；路由和高级参数可按需再设置。
          </CardDescription>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              推荐模型目录
              {directoryMeta?.updatedAt ? ` · 更新于 ${directoryMeta.updatedAt.slice(0, 10)}` : directoryMeta?.applied ? " · 已同步" : " · 待同步"}
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline disabled:opacity-60"
              onClick={() => void syncDirectory()}
              disabled={isDirectorySyncing}
            >
              <RefreshCw className={cn("h-3 w-3", isDirectorySyncing && "animate-spin")} />
              {isDirectorySyncing ? "同步中…" : "立即同步"}
            </button>
            {directoryMeta && !directoryMeta.online && directoryMeta.lastError ? (
              <span className="text-amber-700">离线，使用上次清单</span>
            ) : null}
          </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction} onClick={() => setIsAddProviderOpen(true)}>
            <Plus className="h-4 w-4" /> 添加厂商
          </Button>
        </div>
      </CardHeader>
      <CardContent className={cn("grid min-w-0 gap-4 pt-5 md:grid-cols-2", embedded && "px-0 pb-0")}>
        {/* 第三方厂商：拆成「推荐添加」与「注册入口」两个独立模块 */}
        <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
          <button
            type="button"
            className="flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/10 hover:shadow-sm"
            onClick={() => onCreateCustomProvider({ displayName: XINGCHEN_DISPLAY_NAME, baseURL: XINGCHEN_BASE_URL })}
          >
            <span className="flex items-center gap-2 font-medium text-primary"><Sparkles className="h-4 w-4" /> 推荐添加第三方厂商——星辰AI</span>
            <span className="shrink-0 text-xs text-muted-foreground">填入 API Key 即可使用 →</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-dashed bg-background p-4 text-left text-sm font-medium text-primary transition-all hover:border-primary hover:bg-primary/5"
            onClick={() => void openDesktopExternal(XINGCHEN_REGISTER_URL)}
          >
            <ExternalLink className="h-4 w-4 shrink-0" />
            <span className="underline-offset-4 hover:underline">还没有星辰AI账号？前往注册拿 API KEY</span>
          </button>
        </div>

        {visibleViewModels.map((item) => (
          <ProviderStatusCard
            key={item.provider.provider}
            item={item}
            onOpenConfig={onOpenConfig}
            onTest={onTest}
            onRefreshModels={onRefreshModels}
            onRefreshBalance={onRefreshBalance}
            onSetReasoning={onSetReasoning}
            onSetHiddenModels={onSetHiddenModels}
            onRemove={() => onRemoveProvider(item.provider)}
            isRemoving={removingProvider === item.provider.provider}
            isRefreshingModels={refreshingModelProvider === item.provider.provider}
          />
        ))}
        {!visibleViewModels.length ? (
          <div className="rounded-xl border border-dashed bg-background/70 p-6 text-center text-sm text-muted-foreground md:col-span-2">
            <PlugZap className="mx-auto mb-3 h-6 w-6 text-primary" />
            <div className="font-medium text-foreground">还没有可用的模型连接</div>
            <div className="mt-1">添加内置厂商或自定义服务后，即可配置第一个文本模型。</div>
          </div>
        ) : null}
      </CardContent>
      <Dialog open={isAddProviderOpen} onOpenChange={setIsAddProviderOpen}>
        <AppDialogContent
          title="添加模型厂商"
          description="选择一个内置厂商模板，或添加你自己的 OpenAI 兼容服务。"
          className="max-w-2xl"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className="sm:col-span-2 flex flex-col gap-2 rounded-xl border border-primary/40 bg-primary/5 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/10 hover:shadow-sm"
              onClick={() => {
                setIsAddProviderOpen(false);
                onCreateCustomProvider({ displayName: XINGCHEN_DISPLAY_NAME, baseURL: XINGCHEN_BASE_URL });
              }}
            >
              <div className="flex items-center gap-2 font-medium text-primary"><Sparkles className="h-4 w-4" /> 【第三方厂商】星辰AI</div>
              <div className="text-xs text-muted-foreground">第三方厂商 · 注册后填入 API Key 即可使用，创作更快更稳。</div>
            </button>
            <button
              type="button"
              className="flex items-center gap-2 text-left text-sm font-medium text-primary underline-offset-4 hover:underline sm:col-span-2"
              onClick={() => void openDesktopExternal(XINGCHEN_REGISTER_URL)}
            >
              <ExternalLink className="h-4 w-4 shrink-0" /> 还没有星辰AI账号？前往注册拿 API KEY
            </button>
            {addableBuiltIns.map((provider) => (
              <button
                key={provider.provider}
                type="button"
                className="rounded-xl border bg-background p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/5 hover:shadow-sm"
                onClick={() => {
                  setIsAddProviderOpen(false);
                  onOpenConfig(provider.provider);
                }}
              >
                <div className="flex items-center gap-2 font-medium"><PlugZap className="h-4 w-4 text-primary" /> {provider.name}</div>
                <div className="mt-2 text-xs text-muted-foreground">推荐模型：{provider.defaultModel}</div>
                <div className="mt-1 truncate text-[11px] text-muted-foreground/80" title={provider.defaultBaseURL}>
                  接口地址已内置：{provider.defaultBaseURL}
                </div>
              </button>
            ))}
            <button
              type="button"
              className="rounded-xl border border-dashed bg-background p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/5 hover:shadow-sm"
              onClick={() => {
                setIsAddProviderOpen(false);
                onCreateCustomProvider();
              }}
            >
              <div className="flex items-center gap-2 font-medium"><ServerCog className="h-4 w-4 text-primary" /> 自定义厂商</div>
              <div className="mt-2 text-xs text-muted-foreground">连接任意 OpenAI 兼容服务。</div>
            </button>
          </div>
          {!addableBuiltIns.length ? (
            <div className="mt-3 text-sm text-muted-foreground">所有内置厂商都已添加；你仍可以添加自定义厂商。</div>
          ) : null}
        </AppDialogContent>
      </Dialog>
    </Card>
  );
}
