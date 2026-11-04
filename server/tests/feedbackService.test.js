const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// 隔离数据目录：feedbackService 模块初始化时读取 DATA_DIR。
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-test-"));
process.env.DATA_DIR = tmp;

const { addFeedback, listByAccount, listAll, replyTo } = require("../dist/modules/feedback/feedbackService.js");

test("addFeedback 落盘并可按账号查询，不越权读到他人留言", () => {
  const msg = addFeedback("u1", { type: "suggestion", content: "希望能导出为 PDF" });
  assert.ok(msg.id);
  assert.equal(msg.status, "open");
  assert.equal(msg.reply, "");
  assert.equal(listByAccount("u1").length, 1);
  assert.equal(listByAccount("other").length, 0, "不应读到他人账号的留言");
  assert.equal(listAll().length, 1);
});

test("replyTo 回复后状态变为 replied 并落盘", () => {
  const msg = addFeedback("u2", { type: "bug", content: "导览页白屏" });
  const replied = replyTo(msg.id, "已定位，下个版本修复");
  assert.equal(replied.status, "replied");
  assert.equal(replied.reply, "已定位，下个版本修复");
  const persisted = listAll().find((m) => m.id === msg.id);
  assert.equal(persisted.status, "replied");
});
