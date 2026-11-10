import * as React from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, Megaphone, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  interactWithDesktopNotice,
  useDesktopNotice,
  type DesktopNoticeAction,
  type DesktopNoticeItem,
} from "@/lib/desktop";

const LEVEL_LABELS: Record<DesktopNoticeItem["level"], string> = {
  P0: "系统通知",
  P1: "授权提醒",
  P2: "版本通知",
  P3: "活动",
  P4: "小提示",
};

const LEVEL_TONES: Record<DesktopNoticeItem["level"], string> = {
  P0: "border-amber-500/40 bg-amber-50/80 text-amber-900",
  P1: "border-rose-500/40 bg-rose-50/80 text-rose-900",
  P2: "border-sky-500/40 bg-sky-50/80 text-sky-900",
  P3: "border-violet-500/40 bg-violet-50/80 text-violet-900",
  P4: "border-border bg-muted/60 text-foreground",
};

function LevelIcon({ level }: { level: DesktopNoticeItem["level"] }) {
  if (level === "P0" || level === "P1") {
    return <AlertTriangle className="h-4 w-4" />;
  }
  if (level === "P3") {
    return <Sparkles className="h-4 w-4" />;
  }
  return <Megaphone className="h-4 w-4" />;
}

function useNoticeActions(notice: DesktopNoticeItem) {
  const navigate = useNavigate();

  return React.useCallback(
    async (action: DesktopNoticeAction) => {
      await interactWithDesktopNotice(notice.id, action);
      if (action === "open-feedback") {
        navigate("/feedback");
      }
    },
    [navigate, notice.id],
  );
}

function NoticeButtons({
  notice,
  align = "end",
  tone,
}: {
  notice: DesktopNoticeItem;
  align?: "end" | "between";
  tone: "primary" | "muted";
}) {
  const dispatch = useNoticeActions(notice);
  const buttons = notice.buttons.length > 0 ? notice.buttons : [{ text: "知道了", action: "close" as DesktopNoticeAction }];

  return (
    <div className={cn("flex flex-wrap items-center gap-2", align === "end" ? "justify-end" : "justify-between")}>
      {buttons.map((button, index) => (
        <Button
          key={`${button.text}-${index}`}
          size="sm"
          variant={index === buttons.length - 1 ? "outline" : tone === "primary" ? "default" : "ghost"}
          onClick={() => void dispatch(button.action)}
          className="gap-1"
        >
          {button.text}
          {button.action === "check-update" ? <ArrowRight className="h-3.5 w-3.5" /> : null}
        </Button>
      ))}
    </div>
  );
}

function NoticeModal({ notice }: { notice: DesktopNoticeItem }) {
  const dispatch = useNoticeActions(notice);

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : void dispatch("close"))}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <span
            className={cn(
              "mb-2 inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
              LEVEL_TONES[notice.level],
            )}
          >
            <LevelIcon level={notice.level} />
            {LEVEL_LABELS[notice.level]}
          </span>
          <DialogTitle className="text-left text-lg">{notice.title}</DialogTitle>
          <DialogDescription className="text-left text-sm leading-relaxed">{notice.summary}</DialogDescription>
        </DialogHeader>
        {notice.body ? (
          <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm leading-relaxed text-foreground/90">
            {notice.body}
          </div>
        ) : null}
        <NoticeButtons notice={notice} tone="primary" />
      </DialogContent>
    </Dialog>
  );
}

function NoticeCornerCard({ notice }: { notice: DesktopNoticeItem }) {
  const dispatch = useNoticeActions(notice);

  return (
    <aside
      role="dialog"
      aria-live="polite"
      className="pointer-events-auto w-[340px] rounded-xl border border-border bg-background/95 p-4 shadow-lg backdrop-blur"
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            LEVEL_TONES[notice.level],
          )}
        >
          <LevelIcon level={notice.level} />
          {LEVEL_LABELS[notice.level]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-foreground">{notice.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{notice.summary}</p>
        </div>
        <button
          type="button"
          aria-label="关闭"
          onClick={() => void dispatch("close")}
          className="shrink-0 rounded-sm text-muted-foreground transition hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3">
        <NoticeButtons notice={notice} tone="muted" />
      </div>
    </aside>
  );
}

function NoticeBanner({ notice }: { notice: DesktopNoticeItem }) {
  const dispatch = useNoticeActions(notice);

  return (
    <div className="pointer-events-auto flex w-full items-center gap-3 rounded-lg border border-border bg-background/95 px-4 py-2 shadow-sm backdrop-blur">
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
          LEVEL_TONES[notice.level],
        )}
      >
        <LevelIcon level={notice.level} />
        {LEVEL_LABELS[notice.level]}
      </span>
      <p className="min-w-0 flex-1 truncate text-xs text-foreground">
        <span className="font-medium">{notice.title}</span>
        <span className="ml-2 text-muted-foreground">{notice.summary}</span>
      </p>
      <NoticeButtons notice={notice} tone="muted" />
      <button
        type="button"
        aria-label="关闭"
        onClick={() => void dispatch("close")}
        className="shrink-0 rounded-sm text-muted-foreground transition hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// 克制原则：只在用户停手输入之后才弹居中模态，避免写到一半被打断。
// 最多延后 20 秒兜底，保证授权失效这类信息不会一直不出现。
function useQuietMoment(quietMs = 8000, capMs = 20000) {
  const [quiet, setQuiet] = React.useState(false);

  React.useEffect(() => {
    let quietTimer: ReturnType<typeof setTimeout> | null = null;
    let capTimer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (quietTimer) {
        clearTimeout(quietTimer);
      }
      quietTimer = setTimeout(() => setQuiet(true), quietMs);
    };

    const onInput = () => {
      setQuiet(false);
      schedule();
    };

    schedule();
    capTimer = setTimeout(() => setQuiet(true), capMs);
    window.addEventListener("keydown", onInput, true);
    window.addEventListener("beforeinput", onInput, true);

    return () => {
      if (quietTimer) {
        clearTimeout(quietTimer);
      }
      if (capTimer) {
        clearTimeout(capTimer);
      }
      window.removeEventListener("keydown", onInput, true);
      window.removeEventListener("beforeinput", onInput, true);
    };
  }, [quietMs, capMs]);

  return quiet;
}

// 位置策略：只有 P0 系统与 P1 授权走居中模态，其余一律不抢焦点。
// P2 版本、P3 活动、P4 小提示走右下角浮层，维护预告这类长驻短讯走顶部横幅。
export function NoticeCenter() {
  const snapshot = useDesktopNotice();
  const notice = snapshot.notice;
  const quiet = useQuietMoment();

  if (!notice) {
    return null;
  }

  const useModal = notice.level === "P0" || notice.level === "P1";

  // 版本更新说明已经合进首启引导卡片，这里不再重复推送同一条消息。
  if (notice.level === "P2" || notice.type === "update") {
    return null;
  }

  if (useModal) {
    // 用户正在输入时先不打断，等停手再显示。
    if (!quiet) {
      return null;
    }
    return <NoticeModal notice={notice} />;
  }

  if (notice.placement === "banner") {
    return (
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-3">
        <div className="w-full max-w-4xl">
          <NoticeBanner notice={notice} />
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-40 flex justify-end">
      <NoticeCornerCard notice={notice} />
    </div>
  );
}
