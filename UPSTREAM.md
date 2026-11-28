# UPSTREAM.md · 上游同步状态与流程

> 本文件记录「我方 fork」与「上游开源项目」的版本关系、冲突热区、合并流程与验证口径。
> 每次完成一次上游同步后，必须更新下面的「当前状态」表，并打对应的 `upstream-<ver>` tag。

## 1. 仓库关系

| 角色 | 地址 | 说明 |
| --- | --- | --- |
| 上游（只读） | https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant | public，默认分支 `main`，禁止推送、禁止开 PR、禁止改其配置 |
| 我方 origin | https://github.com/zhnn456/AI-Novel-Writing-Assistant | private，所有写操作只发生在这里 |
| 本地工作副本 | `D:\AI小说-爆改\biz-novel-studio` | remote：`origin`=我方，`upstream`=上游 |

## 2. 当前状态

| 项目 | 值 |
| --- | --- |
| 我方同步分支 | `merge-up-0.8.13`（从 `main` 拉出） |
| 已同步到的上游版本 | `v0.8.13`（`264f0986`，tag 点提交即 `264f0986`；`upstream/main` 头 `c3d2ef6d` 仅文档站页面更新），v0.8.12 及更早一并合入 |
| 合并提交 | `d19a19df`（v0.8.10）、`686b2165`（v0.8.11）、`68c85de0`（v0.8.12）、`c8c7e632`（v0.8.13） |
| 上一次完整同步的基线 | `v0.8.12`（`abc83bbe`），对应合并提交 `68c85de0` |
| 上游最新版本 | `v0.8.13`（`264f0986`）；其后只有 1 个纯文档提交（`c3d2ef6d`，`mintlify-docs/**` 桌面版本信息） |
| 尚未同步 | 仅 `v0.8.13` 之后的 1 个纯文档提交，无代码变更待同步 |
| 我方产品版本（desktop） | `0.7.0`（已含上游 v0.8.13 功能，2026-11-28 发布；仍不取上游版本号 `0.8.13`） |

已推送状态：0.6.2 的 `merge-up-0.8.10` 分支、`release-0.6.2` tag 与 `main` 均已推送到 origin；`v0.6.2` 整包已在 CN/HK 两源上线。本次 v0.8.12 同步：`merge-up-0.8.12`、`release-0.6.3` tag 与 `main` 已推送到 origin（发布提交 `f34d7698`），`v0.6.3` 整包（setup 142,085,290 B / portable 110,074,555 B / blockmap / latest.yml）已在 CN/HK 两源上线且 sha256 一致，两台落地页版本标签与下载链接已切到 0.6.3。本次 v0.8.12 同步的取舍：继续保留我方品牌与安装目录（「鲸喜AI写作」/ `Jingxi-AI-Writer`）；导航采用上游新版「全局菜单」（`GlobalNavigationMenu`）并在前景栏保留授权状态徽标，侧栏保留我方「个人中心」入口；`desktop/src/**`（含样本库热更新器）与 `server/src/modules/license/**` 上游零改动，不影响 Keygate 授权链路；上游新增 4 个 SQLite/Postgres 迁移随包发布。

本次 v0.8.13 同步（`c8c7e632`）：合入 56 提交 / 245 文件，10 个冲突按「品牌与发布口径取我方、依赖与工具链取上游、业务逻辑取并集」裁决。保留：品牌与安装目录、`javascript-obfuscator`、`@img/sharp-win32-x64`、桌面托盘 `Tray/Menu`、静默安装三重试、`normalizeString` + `silentErrorStatuses` 的错误归一化（并叠加 Blob 错误体解析）。跟随上游：Node `^24`、`tsrs` + `typescript-legacy@5.9.3`（根 `typecheck` 走 `benchmark-tsrs.cjs --check`）、vite 8、`better-sqlite3` 12.11.1、`electron-updater` 6.8.11、`express` 5.3、`zod` 4.6、react 19.3。新增迁移 `20261125233000_chapter_author_provenance`（Postgres + SQLite 各一份）随包发布。发布说明守卫改写为我方口径（`docs/releases/release-notes.md` + README 版本声明），不再依赖上游内置 `desktopReleaseNotes.ts`。

## 3. 分支模型

```
upstream/main ──► sync/upstream（只做快进，禁止在上面提交）
                        │
                        ▼
                    merge-up-<ver>  ← 一批一批 merge 上游 tag，逐段验证
                        │
                        ▼
                      main（发布线）
```

- `sync/upstream` 只用于 `git fetch upstream --tags` 后的快进对齐，不放任何我方改动。
- `merge-up-<ver>` 是本轮同步的工作分支，允许出现临时修复提交。
- 合并顺序固定：`v0.6.3 → v0.7.5 → v0.8.4 → v0.8.8`，每段单独提交、单独跑验证，不允许一口气全并。

## 4. 冲突热区（实测，按出现频率排序）

| 文件 | 冲突原因 | 归边结论 |
| --- | --- | --- |
| `server/src/middleware/auth.ts` | 上游 v0.7.5 改成「远程访问令牌」中间件；我方是「激活授权门禁」 | 合并成双闸门：先令牌（可选，未配置则不启用），再授权门禁（我方规则） |
| `server/src/app.ts` | 上游新增 `/api/access/session`；我方有 license heartbeat、/api/account、/api/feedback | 两侧都保留：`app.use("/api", authMiddleware)` + 我方路由与停机清理 |
| `desktop/scripts/stage-desktop.cjs` | 我方有混淆 / 完整性清单 / 版本一致性断言；上游有 `assertStagedServerDependencies` | 两侧都保留（我方函数 + 上游导出与 `require.main` 守卫） |
| `desktop/scripts/run-electron-builder.cjs` | 我方 `spawnSync`，上游 `parseArgs` | 合并引入（execFileSync + spawnSync + parseArgs 全保留） |
| `client/src/main.tsx` | 我方 NoticeCenter/StartupGuide，上游 AccessTokenGate | 合并：`<AccessTokenGate><AppRouter /></AccessTokenGate>` + 我方两个组件 |
| `client/src/api/client.ts` | 我方 `silentErrorStatuses` / normalizeString，上游 401 事件派发 | 合并：401 事件 + 我方归一化与静默错误 |
| `desktop/package.json` | 版本号 | 保我方版本号（本次 `0.6.0`） |
| `README.md`、`docs/releases/release-notes.md` | 品牌与文案 | 一律保我方 |
| `pnpm-lock.yaml` | 依赖树 | 取上游后 `pnpm install` 重新生成 |
| `site/src/App.tsx` | 官网文案 / 品牌 | 保我方品牌，仅取上游可访问性改动（`id="hero-title"`） |
| `server/src/prompting/prompts/novel/volume/chapterList.prompts.ts`、`server/src/services/novel/volume/volumeChapterListGeneration.ts` | 我方章节标题多样性定制 vs 上游新版分块与债务口径 | 取上游（业务与提示词一律取上游） |

## 5. 归边口语诀

- 授权与打包：一律保我方（`server/src/modules/license/*`、`server/src/middleware/auth.ts` 的授权段、`desktop/scripts/stage-desktop.cjs`、`obfuscate-server-dist.cjs`、`electron-builder.config.cjs`、`desktop/src/runtime/updater.ts`）。
- 业务与提示词：一律取上游。
- 配置与锁文件：取上游，再把我方版本号盖回去。

## 6. 合并流程（逐段执行）

```powershell
cd D:\AI小说-爆改\biz-novel-studio
git fetch upstream --tags
git branch -f sync/upstream upstream/main
git switch merge-up-<ver>
git merge v<tag> --no-commit
# 冲突按第 4 节归边原则解决 → git add
pnpm install            # lock 变动时必做
pnpm typecheck          # 只关注 error
pnpm test               # shared build + server build + node 测试
git commit -m "merge: 上游 v<tag> → merge-up-<ver>（冲突归边说明）"
```

## 7. 验证清单

| 步骤 | 命令 | 通过标准 |
| --- | --- | --- |
| 依赖 | `pnpm install` | 无失败，lock 已更新 |
| 类型 | `pnpm typecheck` | 0 个 `error TS` |
| 服务端测试 | `pnpm test`（= shared build + server build + `node scripts/run-tests.cjs fast`） | 失败仅限第 9 节已登记项 |
| 客户端测试 | `pnpm test:client` | 无新增失败（当前 451/451 全绿） |
| 桌面打包 | `pnpm dist:desktop:nsis` + `pnpm verify:desktop:installer` | 安装包产物存在且校验通过（安装/启动/数据保留/卸载/重装） |

打包环境前置条件（踩过的坑，务必先自检）：

- `PATH` 必须包含 `C:\Windows\System32`（`stage-desktop.cjs` 依赖 `robocopy` 做原生包物理复制，缺了会报 `rename ... ENOENT` 误导性错误）。
- `pnpm` 版本必须等于 `package.json` 的 `packageManager`（`pnpm@10.6.0`）；版本不符时 staging 会失败。可用 `corepack prepare pnpm@10.6.0 --activate` 纠正。
- `pnpm deploy` 若在脚本内失败（Windows 路径问题会被脚本容忍），可单独执行 `pnpm --filter @ai-novel/desktop deploy --prod desktop/build/app`，再用 `AI_NOVEL_SKIP_DEPLOY=1` 走 `stage:desktop`。
- 打包前清空 `desktop/build/app`，避免上次残留导致 `better-sqlite3.__detached__` 改名失败。

Node 版本注意：上游 v0.7.5 起的测试运行器使用 `--test-isolation`，本机 Node 22 不支持；
`server/scripts/run-tests.cjs` 已加能力判定（Node 大版本 ≥24 视为支持，低版本再实测一次），
不支持时退回 Node 默认「每文件一进程」。同版本适配还涉及：

- `server/tests/testInfrastructure/ragConfigTestIsolation.test.js`：`isolationArgs()` 按版本决定是否带参数，`fail 0` 断言兼容 `ℹ fail 0` / `# fail 0` 两种输出。
- `server/tests/postgresMigrateDeployPath.test.js`：Windows `core.autocrlf=true` 会把 LF 检出成 CRLF，校验和先归一到 LF 再计算，避免误判「历史 SQL 被改写」。
- `server/tests/fixtures/directorSimplification.baseline.json`：`clientStatusDerivation` 基线随上游实现下调至 205。
- `.github/workflows/desktop-beta-release.yml`、`desktop-release.yml`：`AI_NOVEL_GITHUB_OWNER` 指向自有仓库 `zhnn456`，避免误用上游 owner 发布。
- `client/tests/directorNext.test.js`、`client/tests/directorWorkspace.test.js`：工作目录名含中文时 `new URL(...).pathname` 会被百分号编码，取路径改用 `decodeURIComponent(...)`。
- `desktop/scripts/verify-desktop-installer.cjs`：提升权限安装时 NSIS 把快捷方式写到「公共桌面 / 所有用户开始菜单」，校验需同时认用户级与机器级位置。
- 客户端两处按「品牌保我方」收窄的断言：`client/tests/homeDirectorProgress.test.js`（首页自研「直达章节」快捷入口允许旧编辑器链接，仅限制推荐下一步主面板）、`client/src/pages/creativeHub/creativeHubDesignContracts.test.mjs`（不引用上游 Agent 仓库地址）。

## 8. 回滚

- 单段回滚：`git reset --hard <该段合并前的提交>`（提交号见 `git log --oneline`）。
- 整体回滚：`git reset --hard pre-sync-20261118`（存档 tag，含 0.5.33.1 改造 WIP）。
- 回滚前先确认工作区干净；已 push 的分支不要 rebase，用 revert。

## 9. 当前已知失败（合并后登记，非本次合并新增功能缺陷）

| 测试 | 现状 | 结论 |
| --- | --- | --- |
| `getAccount 返回脱敏资料` | actual `af0e1aada60a` vs expected `user-a` | 基线同样红，历史遗留，待单独立项 |
| `addFeedback 落盘…` | 基线同样红 | 历史遗留 |
| `激活成功后写入签名缓存` | 已修：旧测试按上游明文 JSON 协议写，Keygate 已改 Ed25519 令牌，测试改为「非 Keygate 协议被拒绝且不落缓存」+「伪造缓存被拒」 | 2026-11-28 修复，`licenseService.test.js` 3/3 |
| `quality observer retains the structured AI assessment…` | 合并后红：`Missing expected rejection` | 上游 v0.8.8 新测试期望 ai_copilot 拒绝 repairable 评估，我方执行合同形状/门禁路径判定不同，待单独排查 |
| `task-sheet generation forwards the assessment once…` | 合并后红：同上 | 同上 |
| `enabled style review reuses one acceptance call…` 等 styleAcceptance 4 条 | 合并后红：`expected 'voice'/'continue_with_risk'/'continue'` vs `actual 'pacing'/'repairable'/'repair_once'` | 源于我方 `ChapterAcceptanceAssessmentService` 的字数门禁改造（未设目标字数时按 1500 字兜底、强制扩写），属业务定制，非合并缺陷；如需跟随上游口径需单独立项评估 |
| `AI continuity conflicts guide the existing contract generator…` | 合并后红：`Error: offline generator boundary` | 断网/边界挡板触发，待确认是否上游测试对离线环境的假设差异 |
| `V1 generation…` / `V2 write and repair…` / `V2 review and scoped audit…`（`manualKernelHttp.test.js`） | 单文件跑 3/3 全绿；全量跑时红（`undefined vs true`、`application/json vs text/event-stream`） | 属 `production/application` 批内共享进程污染，非契约缺失，待单独排查批内副作用 |
| `routes.test.js` 偶发 6 条 `fetch failed (bad port)` | v0.8.13 合并后出现，单跑该文件 3 次全绿 | 本机 Windows 动态端口范围被设为 1024–15000，`listen(0)` 会分到 undici 禁用的端口。已在 `server/scripts/testing/sqlite-preload.cjs` 让 `listen(0)` 改用安全端口，非业务缺陷 |
| `failed style and repair verification…` / `a rule with automatic rewrite disabled…` / `AI refusal and narrative diagnosis…` | 合并后红，与本表 styleAcceptance 同源 | 我方验收/门禁定制口径，非合并缺陷 |

v0.8.13 合并后后端基线（2026-11-28，Node 24.21 / pnpm 10.6）：3109 项、3074 通过、23 失败 = 本表登记的既有失败 17 条 + 端口偶发 6 条（已修）。`pnpm test:release-guards` 37/37 全绿，`pnpm typecheck`（tsrs）四包全绿。

已修复并回归通过：27 条「403 授权拦截」类上游路由测试（授权中间件加测试运行器旁路）、2 条章节标题集中度测试（取上游实现）、1 条简化度 ratchet（基线随上游下调到 205）、测试运行器文件参数测试（能力判定不再多打一次探测）、RAG_ENABLED=false 两条隔离测试（参数与输出格式兼容 Node 22）、PG 历史迁移校验和测试（按 LF 归一）。

## 10. 安全护栏

1. 绝不向 `ExplosiveCoderflome/AI-Novel-Writing-Assistant` 推送、开 PR、改配置、改 Issue。
2. 授权相关逻辑改动（`server/src/modules/license/*`、`auth.ts` 授权段）必须保持「未激活可浏览、写操作受限」的口径，不得因合并被上游覆盖。
3. **授权测试旁路（正式口径，非临时补丁）**：
   - 位置：`server/src/modules/license/entitlement.ts` 的 `isLicenseTestBypassEnabled()`，以及 `server/src/middleware/auth.ts` 的最前早退。
   - 生效条件（必须同时满足，缺一不可）：存在 `NODE_TEST_CONTEXT`，且**不存在** `AI_NOVEL_DESKTOP_RUNTIME`（桌面成品标识）。
   - 存在理由：上游自带的路由/服务测试在无激活码环境下会被授权闸门拦成 403，旁路仅用于测试环境。
   - 红线：不得放宽上述任一条件；不得被产品代码、UI、客户端或打包脚本引用；成品（桌面安装版）内必须不可触发。
   - 变更管控：任何对旁路条件的修改都要单独评审，并在合并后的验证清单里手工确认「成品内不可触发」。
   - 实测记录（2026-11-18，Node 22）：设置 `NODE_TEST_CONTEXT` + `AI_NOVEL_DESKTOP_RUNTIME` → `false`（成品不可触发）；仅 `NODE_TEST_CONTEXT` → `true`；两者都不设 → `false`。桌面 `desktop/src/main.ts` 启动时必写 `AI_NOVEL_DESKTOP_RUNTIME`，因此成品内恒为关闭。
4. 单次同步若冲突文件超过 40 个或预计耗时超过 2 天，应暂停跟随、改评估上游取舍。
5. 每次同步完成后更新本文件第 2 节并打 tag。
6. **合并基座口径**：默认从 `main`（发布线）拉出 `merge-up-<ver>`，不把未验收的授权语义分支（如 `fix/0.5.33.1-allowance` 的「未激活不再拦截写操作」）混进同步线。需要新授权语义时，另起分支、单独验收后再合入。
