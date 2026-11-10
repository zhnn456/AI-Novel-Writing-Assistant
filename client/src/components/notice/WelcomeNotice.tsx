import * as React from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { APP_RUNTIME, APP_VERSION } from "@/lib/constants";
import { checkForDesktopUpdates } from "@/lib/desktop";

// 首次启动弹窗的文案与结构随安装包走：每个版本只在第一次打开时出现一次，
// 运营改文案要发版，所以这里只放稳定的欢迎与使用引导，不放活动内容。
const WELCOME_STORAGE_PREFIX = "ai-novel:welcome-seen:";

const WELCOME_CONTENT = {
  title: "欢迎使用鲸喜AI写作",
  summary: "从一句设定到完整章节，写作、续写、改稿和素材管理都在一个工作台里完成。",
  items: [
    "新建作品后先定世界观与人物，后续章节会沿用同一套设定。",
    "大纲、分卷和正文可以分开推进，卡住时用续写把当前场景接下去。",
    "更新、日志和授权入口都在系统设置里，遇到问题先看日志再反馈。",
  ],
};

function readSeen(version: string): boolean {
  try {
    return window.localStorage.getItem(`${WELCOME_STORAGE_PREFIX}${version}`) === "true";
  } catch {
    return true;
  }
}

function markSeen(version: string): void {
  try {
    window.localStorage.setItem(`${WELCOME_STORAGE_PREFIX}${version}`, "true");
  } catch {
    // 本地存储不可用时宁可不记，也不要因为写失败反复弹窗。
  }
}

export function WelcomeNotice() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (APP_RUNTIME !== "desktop" || readSeen(APP_VERSION)) {
      return undefined;
    }

    // 等首屏渲染稳定后再出现，避免和启动壳、加载态抢注意力。
    const timer = window.setTimeout(() => setOpen(true), 1_200);
    return () => window.clearTimeout(timer);
  }, []);

  const close = React.useCallback(() => {
    markSeen(APP_VERSION);
    setOpen(false);
  }, []);

  if (!open) {
    return null;
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <span className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            首次启动引导
          </span>
          <DialogTitle className="text-left text-lg">{WELCOME_CONTENT.title}</DialogTitle>
          <DialogDescription className="text-left text-sm leading-relaxed">{WELCOME_CONTENT.summary}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 rounded-md bg-muted/40 p-4 text-sm leading-relaxed text-foreground/90">
          {WELCOME_CONTENT.items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void checkForDesktopUpdates();
            }}
          >
            检查更新
          </Button>
          <Button size="sm" onClick={close}>
            开始创作
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
