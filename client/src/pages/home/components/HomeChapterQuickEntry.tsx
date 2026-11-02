import type { MouseEvent } from "react";
import { ArrowRight, PenLine } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWorkflowBadge } from "@/lib/novelWorkflowTaskUi";
import { getHomeNovelTask, type HomeNovelItem } from "../homeViewModel";

/**
 * 首页「我的小说 · 直达章节」快捷入口。
 * 目标：让用户随时在首页一步进到「章节执行」（正文写作区），
 * 不再需要在多级页面里找入口。
 * 进入链接：/novels/:id/edit?stage=chapter  →  打开小说并直接落在「章节执行」标签。
 */
export function HomeChapterQuickEntry(props: {
  novels: HomeNovelItem[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const { novels, loading, error, onRetry } = props;
  const hasNovels = novels.length > 0;

  return (
    <Card className="home-chapter-quick-entry">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-xl tracking-normal">
            <PenLine className="h-5 w-5 text-info" aria-hidden="true" />
            我的小说 · 直达章节
          </CardTitle>
          <Button asChild size="sm" variant="ghost">
            <Link to="/novels">
              查看全部 <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        {loading ? (
          <div className="grid gap-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`home-chapter-loading-${index}`} className="h-16 animate-pulse rounded-lg border bg-muted/50" />
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">无法加载小说项目。</span>
            <Button variant="outline" size="sm" onClick={onRetry}>重新加载</Button>
          </div>
        ) : !hasNovels ? (
          <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
            创建小说后，这里会显示直达正文的快捷入口。
          </div>
        ) : (
          <div className="grid gap-3">
            {novels.map((novel) => (
              <NovelChapterRow
                key={novel.id}
                novel={novel}
                onStopPropagation={(event) => event.stopPropagation()}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NovelChapterRow(props: {
  novel: HomeNovelItem;
  onStopPropagation: (event: MouseEvent<HTMLElement>) => void;
}) {
  const { novel, onStopPropagation } = props;
  const workflowTask = getHomeNovelTask(novel);
  const workflowBadge = getWorkflowBadge(workflowTask);
  const isShortStory = novel.narrativeForm === "short_story";
  const entryTo = isShortStory
    ? `/novels/${novel.id}/story`
    : `/novels/${novel.id}/edit?stage=chapter`;
  const entryLabel = isShortStory ? "打开作品" : "进入章节";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/80 bg-card px-5 py-4 transition hover:border-info/60 hover:shadow-[0_8px_24px_-12px_hsl(var(--foreground)/0.22)]">
      <div className="min-w-0 space-y-1.5">
        <div className="line-clamp-1 text-base font-semibold tracking-normal">{novel.title}</div>
        <div className="flex flex-wrap items-center gap-2">
          {workflowBadge ? (
            <Badge variant={workflowBadge.variant}>{workflowBadge.label}</Badge>
          ) : (
            <Badge variant="outline">项目资料</Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {isShortStory ? "短篇" : `${novel._count.chapters} 章`}
          </span>
        </div>
      </div>
      <Button asChild size="default">
        <Link to={entryTo} onClick={onStopPropagation}>
          <PenLine className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {entryLabel}
        </Link>
      </Button>
    </div>
  );
}
