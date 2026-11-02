import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { enrichGenres, updateGenre, type GenreOption, type GenreTreeNode } from "@/api/genre";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AppDialogContent,
  Dialog,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import SelectControl from "@/components/common/SelectControl";
import LLMSelector from "@/components/common/LLMSelector";
import { useLLMStore } from "@/store/llmStore";
import { GENRE_PROFILE_FIELDS, buildGenreProfileJson, parseGenreProfile, type GenreProfile } from "../genreProfile";

interface GenreEditDialogProps {
  open: boolean;
  genre: GenreTreeNode | null;
  onOpenChange: (open: boolean) => void;
  parentOptions: GenreOption[];
  blockedParentIds: Set<string>;
}

export default function GenreEditDialog({
  open,
  genre,
  onOpenChange,
  parentOptions,
  blockedParentIds,
}: GenreEditDialogProps) {
  const queryClient = useQueryClient();
  const llm = useLLMStore();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState("");
  const [profile, setProfile] = useState<GenreProfile>(parseGenreProfile(null));

  useEffect(() => {
    if (!open || !genre) {
      return;
    }
    setName(genre.name);
    setDescription(genre.description ?? "");
    setParentId(genre.parentId ?? "");
    setProfile(parseGenreProfile(genre.profileJson));
  }, [genre, open]);

  const filteredParentOptions = useMemo(
    () => parentOptions.filter((option) => !blockedParentIds.has(option.id)),
    [blockedParentIds, parentOptions],
  );

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!genre) {
        throw new Error("题材基底不存在。");
      }
      return updateGenre(genre.id, {
        name: name.trim(),
        description: description.trim() || null,
        parentId: parentId || null,
        profileJson: buildGenreProfileJson(profile),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.genres.all });
      toast.success("题材基底已更新。");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "保存失败。");
    },
  });

  const enrichMutation = useMutation({
    mutationFn: () => {
      if (!genre) {
        throw new Error("题材基底不存在。");
      }
      return enrichGenres({
        genreIds: [genre.id],
        provider: llm.provider,
        model: llm.model,
        temperature: llm.temperature,
        maxTokens: llm.maxTokens,
      });
    },
    onSuccess: async (response) => {
      const first = response.data?.enriched?.[0];
      if (first?.profileJson) {
        setProfile(parseGenreProfile(first.profileJson));
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.genres.all });
      toast.success("AI 丰富完成，可继续手动微调后保存。");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "AI 丰富失败。");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        className="max-w-3xl"
        title="编辑题材基底"
        description="可以修改名称、说明、挂载位置，并维护 AI 丰富的多维参考档案。子节点与已绑定小说会继续保留。"
        footer={(
          <>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="button" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending || !name.trim()}>
              {updateMutation.isPending ? "保存中..." : "保存修改"}
            </Button>
          </>
        )}
        footerClassName="gap-2"
      >
        <div className="space-y-5">
          <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-foreground">AI 一键丰富</div>
                <div className="text-xs leading-5 text-muted-foreground">
                  用 AI 生成卖点、冲突、结构、代表作品等十个参考维度，生成后可手动微调。
                </div>
              </div>
              <Button
                type="button"
                onClick={() => enrichMutation.mutate()}
                disabled={enrichMutation.isPending}
              >
                {enrichMutation.isPending ? "生成中..." : "AI 丰富"}
              </Button>
            </div>
            <LLMSelector />
          </div>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">名称</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">描述</span>
            <textarea
              rows={3}
              className="min-h-[90px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <div className="space-y-3">
            <div className="text-sm font-semibold text-foreground">参考档案（AI 丰富）</div>
            {GENRE_PROFILE_FIELDS.map((field) => (
              <label key={field.key} className="space-y-1.5 text-sm">
                <span className="font-medium text-foreground">{field.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">{field.hint}</span>
                <textarea
                  rows={2}
                  className="min-h-[64px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={profile[field.key]}
                  onChange={(event) => setProfile((prev) => ({ ...prev, [field.key]: event.target.value }))}
                />
              </label>
            ))}
          </div>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">父级题材基底</span>
            <SelectControl
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="">无父级，作为根题材基底</option>
              {filteredParentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.path}
                </option>
              ))}
            </SelectControl>
          </label>
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
