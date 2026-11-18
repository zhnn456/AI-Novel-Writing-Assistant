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
| 我方同步分支 | `merge-up-0.8.8`（从 `main` 拉出） |
| 已同步到的上游版本 | `v0.8.8`（`bd6627a088aabfb3baa6af74313f281a674811ad`），本次同步的最终目标版本 |
| 合并提交 | `48a37ffe`（v0.6.3）、`1f6389a2`（v0.7.5）、`276d9515`（v0.8.4）、`2e84a5db`（v0.8.8）、`354a11aa`（测试基建收尾） |
| 上一次完整同步的基线 | `v0.5.22`（`498805bd38e9a8e6cae4cf4b9f7db278e7d18311`），对应历史合并提交 `4a96fd8` |
| 上游最新版本 | `v0.8.8`（`bd6627a088aabfb3baa6af74313f281a674811ad`） |
| 尚未同步 | 无（v0.6.3 / v0.7.5 / v0.8.4 / v0.8.8 四段已全部合并） |
| 我方产品版本（desktop） | `0.5.32`（合并时保持我方版本号，不取上游版本号） |

已推送状态：`merge-up-0.8.8` **尚未** push 到 origin，也尚未打 `upstream-0.8.8` tag（待完整验证通过后执行）。

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
| `desktop/package.json` | 版本号 | 保我方 `0.5.32` |
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
| 客户端测试 | `pnpm test:client` | 无新增失败 |
| 桌面打包 | `pnpm dist:desktop:nsis` + `pnpm verify:desktop:installer` | 安装包产物存在且校验通过 |

Node 版本注意：上游 v0.7.5 起的测试运行器使用 `--test-isolation`，本机 Node 22 不支持；
`server/scripts/run-tests.cjs` 已加能力判定（Node 大版本 ≥24 视为支持，低版本再实测一次），
不支持时退回 Node 默认「每文件一进程」。同版本适配还涉及：

- `server/tests/testInfrastructure/ragConfigTestIsolation.test.js`：`isolationArgs()` 按版本决定是否带参数，`fail 0` 断言兼容 `ℹ fail 0` / `# fail 0` 两种输出。
- `server/tests/postgresMigrateDeployPath.test.js`：Windows `core.autocrlf=true` 会把 LF 检出成 CRLF，校验和先归一到 LF 再计算，避免误判「历史 SQL 被改写」。
- `server/tests/fixtures/directorSimplification.baseline.json`：`clientStatusDerivation` 基线随上游实现下调至 205。
- `.github/workflows/desktop-beta-release.yml`、`desktop-release.yml`：`AI_NOVEL_GITHUB_OWNER` 指向自有仓库 `zhnn456`，避免误用上游 owner 发布。

## 8. 回滚

- 单段回滚：`git reset --hard <该段合并前的提交>`（提交号见 `git log --oneline`）。
- 整体回滚：`git reset --hard pre-sync-20261118`（存档 tag，含 0.5.33.1 改造 WIP）。
- 回滚前先确认工作区干净；已 push 的分支不要 rebase，用 revert。

## 9. 当前已知失败（合并后登记，非本次合并新增功能缺陷）

| 测试 | 现状 | 结论 |
| --- | --- | --- |
| `getAccount 返回脱敏资料` | actual `af0e1aada60a` vs expected `user-a` | 基线同样红，历史遗留，待单独立项 |
| `addFeedback 落盘…` | 基线同样红 | 历史遗留 |
| `激活成功后写入签名缓存` | 基线同样红 | 历史遗留 |
| `quality observer retains the structured AI assessment…` | 合并后红：`Missing expected rejection` | 上游 v0.8.8 新测试期望 ai_copilot 拒绝 repairable 评估，我方执行合同形状/门禁路径判定不同，待单独排查 |
| `task-sheet generation forwards the assessment once…` | 合并后红：同上 | 同上 |
| `enabled style review reuses one acceptance call…` 等 styleAcceptance 4 条 | 合并后红：`expected 'voice'/'continue_with_risk'/'continue'` vs `actual 'pacing'/'repairable'/'repair_once'` | 源于我方 `ChapterAcceptanceAssessmentService` 的字数门禁改造（未设目标字数时按 1500 字兜底、强制扩写），属业务定制，非合并缺陷；如需跟随上游口径需单独立项评估 |
| `AI continuity conflicts guide the existing contract generator…` | 合并后红：`Error: offline generator boundary` | 断网/边界挡板触发，待确认是否上游测试对离线环境的假设差异 |

已修复并回归通过：27 条「403 授权拦截」类上游路由测试（授权中间件加测试运行器旁路）、2 条章节标题集中度测试（取上游实现）、1 条简化度 ratchet（基线随上游下调到 205）、测试运行器文件参数测试（能力判定不再多打一次探测）、RAG_ENABLED=false 两条隔离测试（参数与输出格式兼容 Node 22）、PG 历史迁移校验和测试（按 LF 归一）。

## 10. 安全护栏

1. 绝不向 `ExplosiveCoderflome/AI-Novel-Writing-Assistant` 推送、开 PR、改配置、改 Issue。
2. 授权相关逻辑改动（`server/src/modules/license/*`、`auth.ts` 授权段）必须保持「未激活可浏览、写操作受限」的口径，不得因合并被上游覆盖。
3. 授权测试旁路只允许在 `NODE_TEST_CONTEXT` 存在且无 `AI_NOVEL_DESKTOP_RUNTIME`（桌面成品标识）时生效，成品内不可触发。
4. 单次同步若冲突文件超过 40 个或预计耗时超过 2 天，应暂停跟随、改评估上游取舍。
5. 每次同步完成后更新本文件第 2 节并打 tag。
