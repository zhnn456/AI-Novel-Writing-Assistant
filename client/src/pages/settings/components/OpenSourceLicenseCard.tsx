import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const UPSTREAM_URL = "https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant";
const SOURCE_URL = "https://github.com/zhnn456/jingxi-ai-writer";
const MODIFIED_DATE = "2026-11-28";

// 上游仓库根目录 NOTICE 原文（v0.8.13 起含 AGPL 第 7 条附加条款），逐字保留署名（勿删）。
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
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" />
          关于与开源许可
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {/* 署名常显、不可折叠（上游 NOTICE 第 7(b) 条要求），默认只占三行 */}
        <p className="text-sm leading-relaxed text-foreground">
          Based on Biz Novel Studio
        </p>
        <p className="break-all font-mono text-sm leading-relaxed text-foreground">
          {UPSTREAM_URL}
        </p>
        <details className="group">
          <summary className="cursor-pointer select-none text-sm leading-relaxed text-muted-foreground hover:text-foreground">
            本软件为修改版本（{MODIFIED_DATE}），不代表原版，也未获原维护者背书。点击查看许可与版权声明
          </summary>
          <div className="mt-2 space-y-2">
            <p className="text-sm leading-relaxed text-muted-foreground">
              默认按 GNU Affero General Public License v3.0（AGPL-3.0-only）授权，可在遵守该协议的前提下免费使用（含商用）。
              服务型商用或闭源分发须另行取得上游商业授权，详见下方声明。
            </p>
            <p className="break-all text-sm leading-relaxed text-muted-foreground">
              本版本对应源码（含构建脚本，可自行复现安装包）：{SOURCE_URL}
            </p>
            <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-mono text-sm leading-relaxed text-muted-foreground">
              {NOTICE_TEXT}
            </pre>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
