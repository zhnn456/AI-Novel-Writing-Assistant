import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  flattenGenreTreeOptions,
  getGenreTree,
  type GenreOption,
} from "@/api/genre";
import {
  flattenStoryModeTreeOptions,
  getStoryModeTree,
  type StoryModeOption,
} from "@/api/storyMode";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { parseGenreProfile } from "@/pages/genres/genreProfile";

interface GenrePickerDialogProps {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  initialValue?: string;
  onSelect: (option: GenreOption) => void;
}

export function GenrePickerDialog({
  open,
  onOpenChange,
  initialValue,
  onSelect,
}: GenrePickerDialogProps) {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.genres.all,
    queryFn: getGenreTree,
  });
  const options = useMemo(() => (data?.data ? flattenGenreTreeOptions(data.data) : []), [data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        className="max-w-2xl"
        title="题材基底库 · 点选直接用"
        description="浏览题材档案，点“选用”即可把该题材填进建书表单；已 AI 丰富的题材会带出定位、卖点、代表作等参考。"
        footer={(
          <div className="flex w-full items-center justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => { onOpenChange(false); navigate("/genres"); }}>
              去题材库管理 / 丰富
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
          </div>
        )}
        footerClassName="gap-2"
      >
        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {isLoading ? <div className="px-1 text-sm text-muted-foreground">加载中…</div> : null}
          {!isLoading && options.length === 0 ? (
            <div className="px-1 text-sm text-muted-foreground">暂无题材，可去题材库新建。</div>
          ) : null}
          {options.map((option) => {
            const profile = parseGenreProfile(option.profileJson);
            const active = option.id === initialValue;
            return (
              <div
                key={option.id}
                className={`rounded-lg border p-3 ${active ? "border-primary bg-primary/5" : "border-border bg-background"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-foreground">{option.path}</div>
                  <Button
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    onClick={() => { onSelect(option); onOpenChange(false); }}
                  >
                    {active ? "已选用" : "选用"}
                  </Button>
                </div>
                {option.description ? (
                  <div className="mt-1 text-xs text-muted-foreground">{option.description}</div>
                ) : null}
                {profile.positioning ? (
                  <div className="mt-1 text-xs text-foreground/90">定位：{profile.positioning}</div>
                ) : null}
                {profile.sellingPoint ? (
                  <div className="mt-1 text-xs text-foreground/90">卖点：{profile.sellingPoint}</div>
                ) : null}
                {profile.representativeWorks ? (
                  <div className="mt-1 text-xs text-foreground/80">代表作：{profile.representativeWorks}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      </AppDialogContent>
    </Dialog>
  );
}

interface StoryModePickerDialogProps {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  initialValue?: string;
  excludeId?: string;
  onSelect: (option: StoryModeOption) => void;
}

export function StoryModePickerDialog({
  open,
  onOpenChange,
  title,
  initialValue,
  excludeId,
  onSelect,
}: StoryModePickerDialogProps) {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.storyModes.all,
    queryFn: getStoryModeTree,
  });
  const options = useMemo(
    () => (data?.data ? flattenStoryModeTreeOptions(data.data) : []).filter((item) => item.id !== excludeId),
    [data, excludeId],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        className="max-w-2xl"
        title={`${title} · 点选直接用`}
        description="浏览推进模式档案，点“选用”即可填进建书表单；选中后 AI 在开书、规划、写作时会按该模式的硬约束执行。"
        footer={(
          <div className="flex w-full items-center justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => { onOpenChange(false); navigate("/story-modes"); }}>
              去推进模式库管理
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
          </div>
        )}
        footerClassName="gap-2"
      >
        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {isLoading ? <div className="px-1 text-sm text-muted-foreground">加载中…</div> : null}
          {!isLoading && options.length === 0 ? (
            <div className="px-1 text-sm text-muted-foreground">暂无可用推进模式。</div>
          ) : null}
          {options.map((option) => {
            const active = option.id === initialValue;
            const ceilingLabel = option.profile.conflictCeiling === "low"
              ? "低"
              : option.profile.conflictCeiling === "medium"
                ? "中"
                : "高";
            return (
              <div
                key={option.id}
                className={`rounded-lg border p-3 ${active ? "border-primary bg-primary/5" : "border-border bg-background"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-foreground">{option.path}</div>
                  <Button
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    onClick={() => { onSelect(option); onOpenChange(false); }}
                  >
                    {active ? "已选用" : "选用"}
                  </Button>
                </div>
                {option.description ? (
                  <div className="mt-1 text-xs text-muted-foreground">{option.description}</div>
                ) : null}
                {option.profile.coreDrive ? (
                  <div className="mt-1 text-xs text-foreground/90">核心驱动：{option.profile.coreDrive}</div>
                ) : null}
                {option.profile.readerReward ? (
                  <div className="mt-1 text-xs text-foreground/90">读者奖励：{option.profile.readerReward}</div>
                ) : null}
                <div className="mt-1 text-xs text-foreground/80">
                  冲突上限：{ceilingLabel}　·　必须出现：{option.profile.mandatorySignals.join("、") || "—"}
                </div>
              </div>
            );
          })}
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
