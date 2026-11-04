const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// 隔离数据目录：必须在 require 模块前设置，模块初始化时会读取 DATA_DIR。
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "account-test-"));
process.env.DATA_DIR = tmp;

const { getAccount, updateProfile, changePassword } = require("../dist/modules/account/accountService.js");

test("getAccount 返回脱敏资料，不含 passwordHash/passwordSalt", () => {
  const profile = getAccount("user-a");
  assert.equal(profile.accountId, "user-a");
  assert.equal(profile.hasPassword, false);
  assert.equal("passwordHash" in profile, false);
  assert.equal("passwordSalt" in profile, false);
});

test("changePassword 后对外仍脱敏，但内部账号已存哈希/盐", () => {
  const returned = changePassword("user-b", { newPassword: "123456" });
  assert.equal(returned.hasPassword, true);
  assert.equal("passwordHash" in returned, false);
  assert.equal("passwordSalt" in returned, false);

  const raw = JSON.parse(fs.readFileSync(path.join(tmp, "accounts.json"), "utf8"));
  const stored = raw.accounts.find((a) => a.accountId === "user-b");
  assert.ok(stored, "内部账号应已落盘");
  assert.equal(typeof stored.passwordHash, "string");
  assert.ok(stored.passwordHash.length > 0, "哈希不应为空");
  assert.equal(typeof stored.passwordSalt, "string");
  assert.ok(stored.passwordSalt.length > 0, "盐不应为空");
});

test("updateProfile 更新昵称并返回脱敏形态", () => {
  const returned = updateProfile("user-c", { nickname: "新昵称" });
  assert.equal(returned.nickname, "新昵称");
  assert.equal("passwordHash" in returned, false);
  assert.equal("passwordSalt" in returned, false);
});
