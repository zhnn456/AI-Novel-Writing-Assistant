import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("desktop update entry and single first-run dialog contracts are present", () => {
  const badge = read("src/components/layout/AppVersionBadge.tsx");
  const navbar = read("src/components/layout/Navbar.tsx");
  const appLayout = read("src/components/layout/AppLayout.tsx");
  const startupGuide = read("src/components/notice/StartupGuide.tsx");
  assert.match(badge, /立即更新/);
  assert.match(badge, /重启安装/);
  // 首启只保留一张卡（欢迎引导 + 本次更新），不再有第二个「本次更新介绍」弹窗。
  assert.match(startupGuide, /startup-guide-seen/);
  assert.doesNotMatch(navbar, /DesktopReleaseNotesDialog/);
  // 授权提示从内容区常驻横幅改为顶栏小徽标，避免盖住每个页面的子导航。
  assert.match(navbar, /LicenseStatusBadge/);
  assert.doesNotMatch(appLayout, /LicenseLimitBanner/);
});
