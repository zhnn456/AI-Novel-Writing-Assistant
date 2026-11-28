const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// 强制 desktop 运行时 + 临时数据目录，避免缓存写入真实的服务器目录。
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "license-test-"));
process.env.AI_NOVEL_RUNTIME = "desktop";
process.env.AI_NOVEL_APP_DATA_DIR = tmp;
process.env.AI_NOVEL_LICENSE_SECRET = "test-license-secret";
process.env.AI_NOVEL_LICENSE_SERVER_URL = "http://127.0.0.1:0";

const { getLicenseStatus, activateWithCode } = require("../dist/modules/license/licenseService.js");

const LICENSE_FILE = path.join(tmp, "data", "license.json");

const ACTIVATED_STATUS = {
  activated: true,
  bound: true,
  edition: "premium",
  machineFingerprint: "fp",
  activatedAt: "2026-11-01T00:00:00.000Z",
  plan: "premium",
  expiresAt: null,
  remainingDays: null,
  expired: false,
  price: 99,
};

function jsonResponse(payload, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    // licenseService 会读响应头里的服务器时间做校准，mock 里必须提供 headers。
    headers: {
      get(name) {
        return String(name).toLowerCase() === "date" ? new Date("2026-11-28T00:00:00.000Z").toUTCString() : null;
      },
    },
    async json() {
      return payload;
    },
  };
}

function mockFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = original;
  };
}

test("服务器不可达且无缓存 → 回退试用态", async () => {
  const restore = mockFetch(() => Promise.reject(new Error("network down")));
  try {
    const status = await getLicenseStatus();
    assert.equal(status.activated, false);
    assert.equal(status.plan, "trial");
  } finally {
    restore();
  }
});

test("非 Keygate 协议（无 status/token）的激活响应被拒绝且不落缓存", async () => {
  // 上游时代的旧协议：{ success, data: { activated, plan… } }，没有 status/token 字段
  const restoreActivate = mockFetch(() =>
    Promise.resolve(jsonResponse({ success: true, data: ACTIVATED_STATUS })),
  );
  try {
    await assert.rejects(() => activateWithCode("NV-XXXX"), /激活失败/);
    assert.equal(fs.existsSync(LICENSE_FILE), false, "失败时不应写入本地缓存");
  } finally {
    restoreActivate();
  }
});

test("篡改 license.json 后签名失效 → 缓存被拒绝，回退试用态", async () => {
  // 直接伪造一份「看起来已激活」的缓存：签名与内容对不上
  fs.mkdirSync(path.dirname(LICENSE_FILE), { recursive: true });
  fs.writeFileSync(
    LICENSE_FILE,
    JSON.stringify(
      {
        savedAt: new Date().toISOString(),
        licenseKey: "NV-FORGED",
        token: "forged-token",
        planName: "premium",
        signature: "deadbeef",
      },
      null,
      2,
    ),
    "utf8",
  );

  const restoreOffline = mockFetch(() => Promise.reject(new Error("network down")));
  try {
    const status = await getLicenseStatus();
    assert.equal(status.activated, false, "篡改的缓存应被拒绝");
    assert.equal(status.plan, "trial");
  } finally {
    restoreOffline();
  }
});

