import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

const UPSTREAM_OWNER = "ExplosiveCoderflome";
const UPSTREAM_NAME = "AI-Novel-Writing-Assistant";
const MODIFIED_DATE = "2026-11-02";
const AGPL_URL = "https://www.gnu.org/licenses/agpl-3.0.html";

// 上游仓库根目录 NOTICE 原文，保留署名（勿删）。
const NOTICE_TEXT = `Biz Novel Studio (formerly AI Novel Writing Assistant 2)
Copyright 2026 ExplosiveCoderflome and contributors

This repository uses a dual-license model.

By default, this repository is distributed under the GNU Affero General Public
License v3.0 only (AGPL-3.0-only).

Service-style commercial use requires separate commercial authorization from
the project maintainer. This includes using this project, or a modified version
of it, as a backend or core service to provide SaaS, hosted, managed, or
similar services to third parties.

Please comply with the open-source license terms and obtain the appropriate
authorization where applicable.`;

export default function OpenSourceLicenseCard() {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" />
          关于与开源许可
        </CardTitle>
        <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>
          本软件基于开源项目修改而来，遵守上游许可协议并保留署名。
        </CardDescription>
      </CardHeader>
      <CardContent className={`space-y-2 ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
        {/* 正文级：text-sm / 14px */}
        <p className="text-sm leading-relaxed text-foreground">
          本软件基于上游开源项目{" "}
          <span className="font-mono text-[13px]">
            {UPSTREAM_OWNER}/{UPSTREAM_NAME}
          </span>{" "}
          （Whale Novel Studio）修改，修改日期 {MODIFIED_DATE}。
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          默认按{" "}
          <a
            href={AGPL_URL}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary underline underline-offset-2"
          >
            GNU Affero General Public License v3.0（AGPL-3.0）
          </a>{" "}
          授权。
        </p>
        <details className="group">
          <summary className="cursor-pointer select-none text-sm text-muted-foreground hover:text-foreground">
            查看上游版权与归属声明（NOTICE）
          </summary>
          {/* 脚注级：text-xs / 12px，等宽字体展示英文许可摘录 */}
          <pre className="mt-2 whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
            {NOTICE_TEXT}
          </pre>
        </details>
        {/* 脚注级：text-xs / 12px */}
        <p className="text-xs leading-relaxed text-muted-foreground">
          本软件按“原样”提供，不附带任何明示或暗示的担保。服务型商用须另行取得上游商业授权，详见上方声明。
        </p>
      </CardContent>
    </Card>
  );
}
