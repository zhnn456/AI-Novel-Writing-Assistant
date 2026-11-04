import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("设置路由提供独立页面与模型路由配置", async () => {
  const source = await read("src/router/index.tsx");
  assert.match(source, /path: "settings\/models", element: <ModelsSettingsPage \/>/);
  assert.match(source, /path: "settings\/director", element: <DirectorSettingsPage \/>/);
  assert.match(source, /path: "settings\/knowledge", element: <KnowledgeSettingsPage \/>/);
  assert.match(source, /path: "settings\/maintenance", element: <MaintenanceSettingsPage \/>/);
  // 旧模型路由链接仍然可用：落到独立的「模型路由管理」页，不再重定向到模型与厂商页。
  assert.match(source, /path: "settings\/model-routes", element: <ModelRoutesSettingsPage \/>/);
});

test("系统导航只保留设置入口，设置页提供稳定二级导航", async () => {
  const [sidebar, shell] = await Promise.all([
    read("src/components/layout/Sidebar.tsx"),
    read("src/pages/settings/components/SettingsShell.tsx"),
  ]);
  assert.doesNotMatch(sidebar, /label: "模型路由"/);
  for (const label of ["设置总览", "模型与厂商", "自动导演", "知识库与写法", "桌面与维护"]) {
    assert.match(shell, new RegExp(label));
  }
});
