import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

const UPSTREAM_URL = "https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant";
const MODIFIED_DATE = "2026-11-28";
const AGPL_URL = "https://www.gnu.org/licenses/agpl-3.0.html";

// 上游仓库根目录 NOTICE 原文（v0.8.13 起含 AGPL 第 7 条附加条款），保留署名（勿删）。
const NOTICE_TEXT = `Biz Novel Studio (formerly AI Novel Writing Assistant 2)
Copyright (C) 2026 ExplosiveCoderflome and contributors
https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant

This program is free software: you can redistribute it and/or modify it
under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, version 3 only (AGPL-3.0-only).

This program is distributed in the hope that it will be useful, but
WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
or FITNESS FOR A PARTICULAR PURPOSE.

Additional Terms under Section 7 of the GNU AGPL-3.0

1. Author attribution (Section 7(b)): any covered work with an interactive
   user interface must preserve the attribution
   "Based on Biz Novel Studio" and the project URL above in its legal notices.
2. Marking of modified versions (Section 7(c)): modified versions must be
   marked as different from the original and must not be presented as the
   original or as endorsed by its maintainers.
3. Trademarks (Section 7(e)): no right is granted to use the name
   "Biz Novel Studio" or its logos beyond the attribution above.

Commercial Licensing: a separate commercial license is available for those
who cannot or do not wish to comply with AGPL-3.0 and the terms above.`;

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
        {/* 署名必须常显、不得折叠或隐藏（上游 NOTICE 第 7(b) 条要求） */}
        <p className="text-sm leading-relaxed text-foreground">
          Based on Biz Novel Studio
          <br />
          <a
            href={UPSTREAM_URL}
            target="_blank"
            rel="noreferrer"
            className="break-all font-mono text-[13px] text-primary underline underline-offset-2"
          >
            {UPSTREAM_URL}
          </a>
        </p>
        <p className="text-sm leading-relaxed text-foreground">
          本软件（鲸喜AI写作）为上述项目的<strong>修改版本</strong>，修改日期 {MODIFIED_DATE}；
          与原版存在差异，不代表原版，也未获原项目维护者背书。
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
            查看上游版权与归属声明全文（NOTICE）
          </summary>
          {/* 脚注级：text-xs / 12px，等宽字体展示英文许可摘录 */}
          <pre className="mt-2 whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
            {NOTICE_TEXT}
          </pre>
        </details>
        {/* 脚注级：text-xs / 12px */}
        <p className="text-xs leading-relaxed text-muted-foreground">
          本软件按“原样”提供，不附带任何明示或暗示的担保。服务型商用须另行取得上游商业授权。
        </p>
      </CardContent>
    </Card>
  );
}
