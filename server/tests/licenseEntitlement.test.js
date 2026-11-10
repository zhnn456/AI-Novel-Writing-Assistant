const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// 隔离数据目录：必须在 require 模块前设置，账本路径在调用时解析。
const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "license-entitlement-"));
process.env.AI_NOVEL_APP_DATA_DIR = dataRoot;
process.env.AI_NOVEL_RUNTIME = "desktop";

const {
  LIMITED_CHAPTER_LIMIT,
  LicenseLimitError,
  beginChapterGenerationWithStatus,
  isFullLicenseStatus,
  readUsedChapters,
} = require("../dist/modules/license/entitlement.js");

function makeStatus(overrides = {}) {
  return {
    activated: true,
    bound: true,
    edition: "premium",
    machineFingerprint: "fp",
    activatedAt: null,
    plan: "premium",
    expiresAt: null,
    remainingDays: null,
    expired: false,
    price: 399,
    planName: "专业版",
    trialSignupUrl: null,
    ...overrides,
  };
}

test("正式授权：不限章节，也不写额度账本", () => {
  const status = makeStatus();
  assert.equal(isFullLicenseStatus(status), true);
  for (let i = 0; i < 10; i += 1) {
    beginChapterGenerationWithStatus(status, "novel-full").commit();
  }
  assert.equal(readUsedChapters("novel-full"), 0);
});

test("到期授权：每本书只放行 3 章，第 4 章抛 LICENSE_CHAPTER_LIMIT", () => {
  const status = makeStatus({ expired: true, expiresAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(isFullLicenseStatus(status), false);
  const novelId = "novel-expired";
  for (let i = 0; i < LIMITED_CHAPTER_LIMIT; i += 1) {
    beginChapterGenerationWithStatus(status, novelId).commit();
  }
  assert.equal(readUsedChapters(novelId), LIMITED_CHAPTER_LIMIT);
  assert.throws(
    () => beginChapterGenerationWithStatus(status, novelId),
    (error) => error instanceof LicenseLimitError
      && error.code === "LICENSE_CHAPTER_LIMIT"
      && error.statusCode === 403,
  );
});

test("未激活：额度与到期用户一致，换一本书重新拥有 3 章", () => {
  const status = makeStatus({ activated: false, bound: false, edition: "none", plan: "trial" });
  assert.equal(isFullLicenseStatus(status), false);
  for (let i = 0; i < LIMITED_CHAPTER_LIMIT; i += 1) {
    beginChapterGenerationWithStatus(status, "novel-a").commit();
  }
  assert.throws(() => beginChapterGenerationWithStatus(status, "novel-a"), LicenseLimitError);
  // 新书仍有 3 章，符合「每本书 3 章」口径。
  assert.equal(readUsedChapters("novel-b"), 0);
  beginChapterGenerationWithStatus(status, "novel-b").commit();
  assert.equal(readUsedChapters("novel-b"), 1);
});

test("只有产出成功才记 1 章：失败不扣，重复 commit 幂等", () => {
  const status = makeStatus({ activated: false, bound: false, edition: "none", plan: "trial" });
  const novelId = "novel-refund";
  for (let i = 0; i < LIMITED_CHAPTER_LIMIT; i += 1) {
    beginChapterGenerationWithStatus(status, novelId).commit();
  }
  assert.throws(() => beginChapterGenerationWithStatus(status, novelId), LicenseLimitError);

  const failed = beginChapterGenerationWithStatus(status, "novel-failed");
  assert.equal(readUsedChapters("novel-failed"), 0);
  failed.refund(); // 生成失败：没有 commit，不扣额度。
  failed.commit(); // refund 之后即使误调 commit 也不再记账。
  assert.equal(readUsedChapters("novel-failed"), 0);

  const ok = beginChapterGenerationWithStatus(status, "novel-once");
  ok.commit();
  ok.commit(); // 二次 commit 不得重复 +1。
  assert.equal(readUsedChapters("novel-once"), 1);
});

test("提交后立刻落盘：进程重启后额度仍在", () => {
  const status = makeStatus({ activated: false, bound: false, edition: "none", plan: "trial" });
  beginChapterGenerationWithStatus(status, "novel-persist").commit();
  const ledgerPath = path.join(dataRoot, "data", "license-usage.json");
  const exists = fs.existsSync(ledgerPath)
    || fs.existsSync(path.join(dataRoot, "license-usage.json"));
  assert.equal(exists, true);
  assert.equal(readUsedChapters("novel-persist"), 1);
});
