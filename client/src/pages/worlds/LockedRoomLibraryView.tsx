import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  Compass,
  Filter,
  KeyRound,
  Lightbulb,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getLockedRoomLibrary, type LockedRoomCase, type LockedRoomTechnique } from "@/api/world";

type ViewKey = "techniques" | "cases" | "rules";

const FAIRNESS_STYLE: Record<string, string> = {
  合规: "bg-emerald-500/10 text-emerald-700",
  需铺垫: "bg-amber-500/10 text-amber-700",
  慎用: "bg-orange-500/10 text-orange-700",
  高风险: "bg-rose-500/10 text-rose-700",
};

const SPOIL_STYLE: Record<string, string> = {
  light: "bg-emerald-500/10 text-emerald-700",
  medium: "bg-amber-500/10 text-amber-700",
  heavy: "bg-rose-500/10 text-rose-700",
};

const SPOIL_LABEL: Record<string, string> = {
  light: "轻度泄底",
  medium: "中度泄底",
  heavy: "重度泄底",
};

function difficultyLabel(value: number | undefined): string {
  if (!value) return "未标注";
  return `${value} / 5`;
}

function TechniqueCard({ technique, familyName }: { technique: LockedRoomTechnique; familyName: string }) {
  return (
    <article className="flex flex-col rounded-3xl border border-border/35 bg-card/70 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="border-0 bg-muted/60 font-mono text-[11px]">{technique.id}</Badge>
            <Badge variant="secondary" className="border-0 bg-primary/[0.06] font-normal text-primary">{familyName}</Badge>
          </div>
          <h3 className="mt-2 text-base font-semibold tracking-tight">{technique.name ?? "未命名手法"}</h3>
        </div>
        <div className="flex flex-none flex-col items-end gap-1.5">
          {technique.fairness ? (
            <Badge variant="secondary" className={`border-0 font-normal ${FAIRNESS_STYLE[technique.fairness] ?? "bg-muted/60"}`}>
              {technique.fairness}
            </Badge>
          ) : null}
          <span className="text-[11px] text-muted-foreground">难度 {difficultyLabel(technique.difficulty)}</span>
        </div>
      </div>

      <p className="mt-3 line-clamp-4 text-sm leading-6 text-muted-foreground">{technique.coreAction}</p>

      <details className="group mt-4 border-t border-border/30 pt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs text-muted-foreground marker:hidden">
          <span>展开道具、条件与破绽</span>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-3 space-y-3 text-xs leading-5">
          {technique.props?.length ? (
            <div>
              <div className="font-medium text-foreground">所需道具</div>
              <div className="mt-1 text-muted-foreground">{technique.props.join("、")}</div>
            </div>
          ) : null}
          {technique.requirements?.length ? (
            <div>
              <div className="font-medium text-foreground">成立条件</div>
              <div className="mt-1 text-muted-foreground">{technique.requirements.join("；")}</div>
            </div>
          ) : null}
          {technique.detectionClues?.length ? (
            <div>
              <div className="font-medium text-foreground">可被识破的线索</div>
              <div className="mt-1 text-muted-foreground">{technique.detectionClues.join("；")}</div>
            </div>
          ) : null}
          {technique.caution ? (
            <div className="rounded-2xl bg-amber-500/[0.07] px-3 py-2 text-amber-800">
              <span className="font-medium">慎用提示：</span>
              {technique.caution}
            </div>
          ) : null}
        </div>
      </details>
    </article>
  );
}

function CaseCard({ item, techniqueNames }: { item: LockedRoomCase; techniqueNames: Map<string, string> }) {
  const linked = (item.techniques ?? []).map((id) => techniqueNames.get(id) ?? id);
  return (
    <article className="flex flex-col rounded-3xl border border-border/35 bg-card/70 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-tight">{item.title}</h3>
          <div className="mt-1 text-xs text-muted-foreground">
            {[item.author, item.year, item.region, item.form].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="flex flex-none flex-col items-end gap-1.5">
          <Badge variant="secondary" className={`border-0 font-normal ${SPOIL_STYLE[item.spoilLevel ?? ""] ?? "bg-muted/60"}`}>
            {SPOIL_LABEL[item.spoilLevel ?? ""] ?? item.spoilLevel ?? "未标注"}
          </Badge>
          {item.category ? <span className="text-[11px] text-muted-foreground">{item.category}</span> : null}
        </div>
      </div>

      <div className="mt-4 space-y-3 text-sm leading-6">
        <div>
          <div className="text-xs font-medium text-foreground">谜面</div>
          <p className="mt-1 text-muted-foreground">{item.puzzle}</p>
        </div>
        <div>
          <div className="text-xs font-medium text-foreground">解答核心</div>
          <p className="mt-1 text-muted-foreground">{item.answerCore}</p>
        </div>
      </div>

      <details className="group mt-4 border-t border-border/30 pt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs text-muted-foreground marker:hidden">
          <span>可借鉴点与风险</span>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-3 space-y-3 text-xs leading-5">
          {item.borrowPoint ? (
            <div className="rounded-2xl bg-emerald-500/[0.06] px-3 py-2 text-emerald-800">
              <span className="font-medium">可借鉴：</span>
              {item.borrowPoint}
            </div>
          ) : null}
          {item.risk ? (
            <div className="rounded-2xl bg-rose-500/[0.06] px-3 py-2 text-rose-800">
              <span className="font-medium">风险：</span>
              {item.risk}
            </div>
          ) : null}
          {linked.length ? (
            <div className="text-muted-foreground">
              <span className="font-medium text-foreground">关联手法：</span>
              {linked.join("、")}
            </div>
          ) : null}
        </div>
      </details>
    </article>
  );
}

export default function LockedRoomLibraryView() {
  const libraryQuery = useQuery({
    queryKey: ["worlds", "locked-room"],
    queryFn: getLockedRoomLibrary,
    staleTime: 5 * 60 * 1000,
  });
  const [view, setView] = useState<ViewKey>("techniques");
  const [keyword, setKeyword] = useState("");
  const [family, setFamily] = useState<string>("all");
  const [fairness, setFairness] = useState<string>("all");

  const library = libraryQuery.data?.data;
  const modules = library?.modules;
  const techniques = modules?.techniques?.techniques ?? [];
  const cases = modules?.cases?.cases ?? [];
  const familyIndex = modules?.techniques?.meta?.familyIndex ?? [];
  const fairnessLevels = modules?.techniques?.meta?.fairnessLevels ?? ["合规", "需铺垫", "慎用", "高风险"];
  const fairnessRules = modules?.definition?.fairnessRules ?? [];
  const quickSelector = modules?.taxonomy?.quickSelector ?? [];
  const strengthScale = modules?.definition?.strengthScale ?? [];
  const diagnosticQuestions = (modules?.definition?.fiveDiagnosticQuestions ?? []).map((item) =>
    typeof item === "string" ? item : item.question,
  );

  const familyNameByCode = useMemo(
    () => new Map(familyIndex.map((item) => [item.code, item.name])),
    [familyIndex],
  );
  const techniqueNameById = useMemo(
    () => new Map(techniques.map((item) => [item.id, `${item.id} ${item.name ?? ""}`.trim()])),
    [techniques],
  );

  const filteredTechniques = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    return techniques.filter((item) => {
      if (family !== "all" && item.family !== family) return false;
      if (fairness !== "all" && item.fairness !== fairness) return false;
      if (!text) return true;
      return [item.id, item.name, item.coreAction, item.caution, ...(item.props ?? []), ...(item.requirements ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(text);
    });
  }, [techniques, keyword, family, fairness]);

  const filteredCases = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    if (!text) return cases;
    return cases.filter((item) =>
      [item.title, item.author, item.puzzle, item.answerCore, item.borrowPoint, item.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(text),
    );
  }, [cases, keyword]);

  if (libraryQuery.isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2" aria-label="正在加载密室诡计样本库">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-52 animate-pulse rounded-3xl bg-muted/30" />
        ))}
      </div>
    );
  }

  if (libraryQuery.isError || !library) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl bg-destructive/[0.04] px-6 text-center">
        <AlertTriangle className="h-7 w-7 text-destructive/70" aria-hidden="true" />
        <div className="mt-3 font-medium">密室诡计样本库读取失败</div>
        <div className="mt-1 max-w-md text-sm text-muted-foreground">
          当前安装目录里没有可用的样本库，或版本文件损坏。重新安装或等待热更新完成后再试。
        </div>
        <Button type="button" variant="outline" className="mt-4 rounded-full" onClick={() => void libraryQuery.refetch()}>
          重新读取
        </Button>
      </div>
    );
  }

  const totalTechniques = techniques.length;
  const totalCases = cases.length;
  const sourceLabel = library.source === "resources" ? "安装包内置" : "开发目录";

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-border/35 bg-muted/20 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="text-sm font-medium">
                版本 v{library.version ?? "unknown"} · {sourceLabel}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {modules?.definition?.definition?.oneLine}
            </p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span><strong className="font-semibold tabular-nums text-foreground">{totalTechniques}</strong> 条手法</span>
            <span><strong className="font-semibold tabular-nums text-foreground">{totalCases}</strong> 个案例</span>
            <span><strong className="font-semibold tabular-nums text-foreground">{familyIndex.length}</strong> 个族</span>
            <span><strong className="font-semibold tabular-nums text-foreground">{fairnessRules.length}</strong> 条铁律</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {([
          ["techniques", `手法谱系 ${totalTechniques}`],
          ["cases", `经典案例 ${totalCases}`],
          ["rules", "铁律与选型"],
        ] as Array<[ViewKey, string]>).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={view === key ? "default" : "outline"}
            className="rounded-full"
            onClick={() => setView(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {view !== "rules" ? (
        <div className="space-y-3 rounded-2xl bg-muted/20 px-4 py-3">
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={view === "techniques" ? "搜手法名、道具、破绽…" : "搜案例名、作者、谜面…"}
              className="h-9 w-full rounded-full border border-border/40 bg-background pl-9 pr-3 text-sm outline-none focus:border-primary/40"
            />
          </div>
          {view === "techniques" ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <button
                type="button"
                onClick={() => setFamily("all")}
                className={`rounded-full px-3 py-1 text-xs ${family === "all" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
              >
                全部族
              </button>
              {familyIndex.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => setFamily(item.code)}
                  className={`rounded-full px-3 py-1 text-xs ${family === item.code ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}
                >
                  {item.code} {item.name}
                </button>
              ))}
            </div>
          ) : null}
          {view === "techniques" ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-muted-foreground">公平性</span>
              {fairnessLevels.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setFairness(fairness === level ? "all" : level)}
                  className={`rounded-full px-3 py-1 text-xs ${fairness === level ? "bg-foreground text-background" : "bg-background text-muted-foreground hover:text-foreground"}`}
                >
                  {level}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {view === "techniques" ? (
        filteredTechniques.length ? (
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {filteredTechniques.map((item) => (
              <TechniqueCard
                key={item.id}
                technique={item}
                familyName={familyNameByCode.get(item.family ?? "") ?? item.family ?? "未归类"}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-3xl bg-muted/20 px-6 py-16 text-center text-sm text-muted-foreground">
            没有匹配的手法，换个关键词或清空筛选。
          </div>
        )
      ) : null}

      {view === "cases" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredCases.map((item) => (
            <CaseCard key={item.id} item={item} techniqueNames={techniqueNameById} />
          ))}
          {filteredCases.length === 0 ? (
            <div className="rounded-3xl bg-muted/20 px-6 py-16 text-center text-sm text-muted-foreground lg:col-span-2">
              没有匹配的案例，换个关键词再试。
            </div>
          ) : null}
        </div>
      ) : null}

      {view === "rules" ? (
        <div className="space-y-5">
          <section className="rounded-3xl border border-border/35 bg-card/70 p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              <h2 className="text-base font-semibold">公平性铁律</h2>
            </div>
            <div className="mt-3 space-y-2">
              {fairnessRules.map((rule) => (
                <div key={rule.id} className="rounded-2xl bg-muted/25 px-4 py-3 text-sm leading-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="border-0 bg-background font-mono text-[11px]">{rule.id}</Badge>
                    <span className="font-medium">{rule.rule}</span>
                    {rule.level ? (
                      <Badge variant="secondary" className={`border-0 text-[11px] ${rule.level === "铁律" ? "bg-rose-500/10 text-rose-700" : "bg-muted/60"}`}>
                        {rule.level}
                      </Badge>
                    ) : null}
                  </div>
                  {rule.detail ? <p className="mt-1 text-muted-foreground">{rule.detail}</p> : null}
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-border/35 bg-card/70 p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                <h2 className="text-base font-semibold">按需求选型</h2>
              </div>
              <div className="mt-3 space-y-2 text-sm leading-6">
                {quickSelector.map((row, index) => (
                  <div key={`${row.want}-${index}`} className="rounded-2xl bg-muted/25 px-3 py-2">
                    <span className="font-medium">{row.want}</span>
                    <span className="text-muted-foreground"> → {(row.pick ?? []).join("、")}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-border/35 bg-card/70 p-5">
              <div className="flex items-center gap-2">
                <Compass className="h-4 w-4 text-primary" aria-hidden="true" />
                <h2 className="text-base font-semibold">谜面强度五级</h2>
              </div>
              <div className="mt-3 space-y-2 text-sm leading-6">
                {strengthScale.map((item) => (
                  <div key={item.level} className="rounded-2xl bg-muted/25 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">L{item.level}</span>
                      <span className="font-medium">{item.name}</span>
                    </div>
                    <p className="mt-0.5 text-muted-foreground">{item.summary}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">适用：{item.use}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-border/35 bg-card/70 p-5">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500" aria-hidden="true" />
              <h2 className="text-base font-semibold">动笔前的五个诊断问题</h2>
            </div>
            <ol className="mt-3 space-y-2">
              {diagnosticQuestions.map((question, index) => (
                <li key={`${question}-${index}`} className="flex gap-3 rounded-2xl bg-muted/25 px-3 py-2 text-sm leading-6">
                  <span className="font-mono text-xs text-muted-foreground">{index + 1}</span>
                  <span>{question}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      ) : null}
    </div>
  );
}
