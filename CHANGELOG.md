# 变更日志（Biz Novel Studio 商业化改造）

> 每条 = 一个功能提交。配合 Git + Fork 看图：点开提交即可看到改了哪些文件、逐行 diff（红删绿加）。
> 版本号随每次功能改动 +0.0.1。

## 0.4.26（2026-11-02）

### A+B · 优化章节生成卡点
- **放宽"章节合同一致性审查"门禁**（`shared/types/chapterTaskSheetQuality.ts`）：低/中危的合同措辞矛盾不再强制暂停等人确认，自动收敛后继续进正文生成；仅 `unusable`（合同无法收口）/ `overloaded`（章节职责过载）/ `high` 级问题才暂停。
- **改进合同生成提示词**（`server/.../chapterDetail.prompts.ts`）：新增跨字段一致性硬约束（purpose/摘要/任务单/场景卡/结尾状态/下章入口/回报强度一次生成自洽，任务单不得越界、章末扣人主体统一、rewardLevel 匹配职责）。

### 首页直达章节入口
- 新建 `client/src/pages/home/components/HomeChapterQuickEntry.tsx`，在首页"创作设置引导"前挂载"我的小说 · 直达章节"卡片，一键进入章节执行区。

### 章节清单分批生成
- `CHAPTER_LIST_BATCH_SIZE` 默认 3，可用环境变量 `AI_NOVEL_CHAPTER_BATCH_SIZE` 覆盖；末批才阶段兑现/终章收束，跨批防撞车标题预留。

### 禁用上游更新
- 删除 electron-builder `publish`/`app-update.yml` 资源，不再提示升级到上游版本。

### 客户端相对资源路径修复
- 桌面端构建必须设 `AI_NOVEL_CLIENT_BASE=relative`，产物改用 `./assets/...` 相对路径，修复"卡在准备本地写作引擎"启动白屏。
