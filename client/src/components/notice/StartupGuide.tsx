import * as React from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { APP_RUNTIME, APP_VERSION } from "@/lib/constants";
import { fetchCurrentReleaseNotes } from "@/lib/desktop";

// 首次打开引导与「本次更新」合并成一张卡片：一张卡片说清「欢迎 + 三步上手 + 这一版更新了什么」，
// 每台机器每个版本只出现一次，关闭后不再打扰。配置 Key 仍走单独的快捷配置流程，由这里的主按钮串起来。
const GUIDE_SEEN_PREFIX = "ai-novel:startup-guide-seen:";
const PENDING_FLAG = "ai-novel:startup-guide-pending";
export const STARTUP_GUIDE_CLOSED_EVENT = "ai-novel:startup-guide-closed";
export const STARTUP_GUIDE_OPEN_SETUP_EVENT = "ai-novel:open-quick-setup";

// 清单里读不到本版说明时的兜底文案（与发布说明保持一致，只写结论不写过程）。
const FALLBACK_RELEASE_NOTES = [
  "应用内领取 7 天试用：填邮箱收验证码，验证后自动激活，不用跳浏览器。",
  "试用期功能全开，不限章节、不限生成次数。",
  "反馈直通后台，管理员回复可以回到客户端。",
  "授权激活最多自动重试 3 次，错误提示改为中文。",
];

const STEPS: Array<{ title: string; lines: Array<React.ReactNode> }> = [
  {
    title: "第 1 步・领一张 7 天试用授权码",
    lines: [
      "点「免费领取 7 天试用」，先填邮箱收邮箱验证码，随后收取授权码；回到「设置 → 授权与激活」粘贴即可。",
      "同一个邮箱只能领一次，换电脑也能用同一张码。",
    ],
  },
  {
    title: "第 2 步・配一个写作模型",
    lines: [
      "推荐星辰AI大模型平台GEM模型（中文长篇质量稳、响应快）；手头有别的厂商 Key 也能用，接口地址已内置，留空即走官方默认。",
      "【高阶】完全不想注册，可以在「设置 → 模型与厂商」选 Ollama，需本地部署模型。",
    ],
  },
  {
    title: "第 3 步・一句话开书",
    lines: ["首页点「写一本书」，输入一句设定，例如「都市异能：外卖员觉醒」，AI 会把世界观、人物、大纲先铺好，再逐章往下写。"],
  },
];

function readSeen(version: string): boolean {
  try {
    return window.localStorage.getItem(`${GUIDE_SEEN_PREFIX}${version}`) === "true";
  } catch {
    return true;
  }
}

function markSeen(version: string): void {
  try {
    window.localStorage.setItem(`${GUIDE_SEEN_PREFIX}${version}`, "true");
  } catch {
    // 本地存储不可用时不记，也不要因为写失败反复弹窗。
  }
}

export function StartupGuide() {
  const [open, setOpen] = React.useState(false);
  const [showUpdate, setShowUpdate] = React.useState(false);
  const [releaseNotes, setReleaseNotes] = React.useState<string[]>(FALLBACK_RELEASE_NOTES);

  // 先占位告诉快捷配置流程「引导还没关」，避免两个弹窗同时压在首页上。
  React.useEffect(() => {
    if (APP_RUNTIME !== "desktop" || readSeen(APP_VERSION)) {
      return undefined;
    }
    try {
      window.sessionStorage.setItem(PENDING_FLAG, "true");
    } catch {
      // 忽略存储不可用。
    }

    const timer = window.setTimeout(() => setOpen(true), 1_200);
    return () => window.clearTimeout(timer);
  }, []);

  React.useEffect(() => {
    if (APP_RUNTIME !== "desktop") {
      return undefined;
    }
    let cancelled = false;
    void fetchCurrentReleaseNotes().then((notes) => {
      if (cancelled || !notes) {
        return;
      }
      const lines = notes
        .split(/\r?\n/)
        .map((line) => line.replace(/^[-•·]\s*/, "").trim())
        .filter((line) => line.length > 0);
      if (lines.length > 0) {
        setReleaseNotes(lines);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const close = React.useCallback((openSetup: boolean) => {
    markSeen(APP_VERSION);
    try {
      window.sessionStorage.removeItem(PENDING_FLAG);
    } catch {
      // 忽略存储不可用。
    }
    setOpen(false);
    window.dispatchEvent(new Event(STARTUP_GUIDE_CLOSED_EVENT));
    if (openSetup) {
      window.dispatchEvent(new Event(STARTUP_GUIDE_OPEN_SETUP_EVENT));
    }
  }, []);

  if (!open) {
    return null;
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : close(false))}>
      <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <span className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            首次启动引导 · v{APP_VERSION}
          </span>
          <DialogTitle className="text-left text-xl">欢迎使用鲸喜 AI 写作</DialogTitle>
          <DialogDescription className="text-left text-sm leading-relaxed">
            三步就能开始写第一本书，试用期功能全开，不限章节。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {STEPS.map((step) => (
            <section key={step.title} className="rounded-lg border border-border/70 bg-muted/30 p-3.5">
              <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
              {step.lines.map((line, index) => (
                <p
                  key={index}
                  className={cn(
                    "mt-1.5 text-[13px] leading-relaxed",
                    index === 0 ? "text-foreground/90" : "text-muted-foreground",
                  )}
                >
                  {line}
                </p>
              ))}
            </section>
          ))}
        </div>

        <div className="rounded-lg border border-border/60">
          <button
            type="button"
            onClick={() => setShowUpdate((prev) => !prev)}
            className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs text-muted-foreground transition hover:text-foreground"
            aria-expanded={showUpdate}
          >
            <span>本次更新（v{APP_VERSION}）· {showUpdate ? "收起" : "展开查看"}</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", showUpdate ? "rotate-180" : "")} />
          </button>
          {showUpdate ? (
            <ul className="space-y-1.5 border-t border-border/60 px-3.5 py-3 text-[13px] leading-relaxed text-foreground/90">
              {releaseNotes.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => close(false)}>
            稍后再说
          </Button>
          <Button size="sm" onClick={() => close(true)}>
            开始配置
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
