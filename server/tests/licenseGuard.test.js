const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "license-guard-"));
process.env.AI_NOVEL_RUNTIME = "desktop";
process.env.AI_NOVEL_APP_DATA_DIR = tmp;
process.env.AI_NOVEL_LICENSE_SECRET = "guard-test-secret";
process.env.AI_NOVEL_LICENSE_SERVER_URL = "http://127.0.0.1:0";

const {
  assessClock,
  consumeQuota,
  readQuota,
  readRuntimeState,
  writeRuntimeState,
} = require("../dist/modules/license/stateStore.js");

const STATE_FILE = path.join(tmp, "data", "cache.state");
const DAY = 24 * 60 * 60 * 1000;

test("状态文件落盘为不可读的密文", () => {
  writeRuntimeState({ v: 1, seen: Date.now(), online: Date.now(), used: 0 });
  const raw = fs.readFileSync(STATE_FILE);
  const text = raw.toString("utf8");
  for (const word of ["online", "seen", "used", "licenseKey"]) {
    assert.equal(text.includes(word), false, `不应出现明文片段：${word}`);
  }
  assert.ok(raw.length > 16, "应为二进制块而非空文件");
});

test("手改状态文件后认证失败，视为没有可信状态", () => {
  const raw = fs.readFileSync(STATE_FILE);
  const tampered = Buffer.from(raw);
  tampered[tampered.length - 1] ^= 0xff;
  fs.writeFileSync(STATE_FILE, tampered);
  assert.equal(readRuntimeState(), null);
});

test("本地时钟回拨（早于历史最大时间 10 分钟以上）被判定不可信", () => {
  const seen = Date.now() + 4 * 60 * 60 * 1000; // 模拟“曾经在 4 小时后”
  writeRuntimeState({ v: 1, seen, online: Date.now(), used: 0 });
  const verdict = assessClock(readRuntimeState(), true);
  assert.equal(verdict.blocked, true);
  assert.equal(verdict.reason, "rollback");
  assert.equal(verdict.now, seen, "判定时间取历史最大值，回拨无法延长有效期");
});

test("超过 3 天没有成功联网 → 降级", () => {
  const online = Date.now() - 4 * DAY;
  writeRuntimeState({ v: 1, seen: Date.now(), online, used: 0 });
  const verdict = assessClock(readRuntimeState(), true);
  assert.equal(verdict.blocked, true);
  assert.equal(verdict.reason, "offline");
});

test("刚刚联网且时间正常 → 放行", () => {
  writeRuntimeState({ v: 1, seen: Date.now(), online: Date.now() - 60_000, used: 0 });
  const verdict = assessClock(readRuntimeState(), true);
  assert.equal(verdict.blocked, false);
});

test("有本地授权但状态文件被删除 → 必须先联网", () => {
  fs.rmSync(STATE_FILE, { force: true });
  const verdict = assessClock(null, true);
  assert.equal(verdict.blocked, true);
  assert.equal(verdict.reason, "legacy");
});

test("试用额度 3 次，第 4 次拒绝", () => {
  writeRuntimeState({ v: 1, seen: Date.now(), online: Date.now(), used: 0 });
  for (let i = 0; i < 3; i += 1) {
    const result = consumeQuota(3);
    assert.equal(result.allowed, true);
    assert.equal(result.used, i + 1);
  }
  const denied = consumeQuota(3);
  assert.equal(denied.allowed, false);
  assert.equal(denied.used, 3);
  assert.equal(readQuota(3).used, 3);
});

test("重建状态文件不能把额度清零（删除即视为无授权状态）", () => {
  fs.rmSync(STATE_FILE, { force: true });
  const verdict = assessClock(null, true);
  assert.equal(verdict.blocked, true);
});
