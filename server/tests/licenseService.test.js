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

test("激活成功后写入签名缓存；服务器不可达时命中有效缓存", async () => {
  // 激活：服务器返回已激活状态
  const restoreActivate = mockFetch(() =>
    Promise.resolve(jsonResponse({ success: true, data: ACTIVATED_STATUS })),
  );
  try {
    const activated = await activateWithCode("NV-XXXX");
    assert.equal(activated.activated, true);
    assert.equal(activated.plan, "premium");
    assert.ok(fs.existsSync(LICENSE_FILE), "应写入本地缓存");
    const raw = JSON.parse(fs.readFileSync(LICENSE_FILE, "utf8"));
    assert.equal(typeof raw.signature, "string", "缓存应带签名");
    assert.ok(raw.signature.length > 0);
  } finally {
    restoreActivate();
  }

  // 服务器连不上 → 命中带有效签名的缓存
  const restoreOffline = mockFetch(() => Promise.reject(new Error("network down")));
  try {
    const status = await getLicenseStatus();
    assert.equal(status.activated, true, "有效签名缓存应被信任");
    assert.equal(status.plan, "premium");
  } finally {
    restoreOffline();
  }
});

test("篡改 license.json 后签名失效 → 缓存被拒绝，回退试用态", async () => {
  // 先写一份有效缓存
  const restoreActivate = mockFetch(() =>
    Promise.resolve(jsonResponse({ success: true, data: ACTIVATED_STATUS })),
  );
  try {
    await activateWithCode("NV-XXXX");
  } finally {
    restoreActivate();
  }
  assert.ok(fs.existsSync(LICENSE_FILE));

  // 手改 activated:false（保留旧签名）→ 签名校验必须失败
  const raw = JSON.parse(fs.readFileSync(LICENSE_FILE, "utf8"));
  raw.status.activated = false;
  fs.writeFileSync(LICENSE_FILE, JSON.stringify(raw, null, 2), "utf8");

  const restoreOffline = mockFetch(() => Promise.reject(new Error("network down")));
  try {
    const status = await getLicenseStatus();
    assert.equal(status.activated, false, "篡改的缓存应被拒绝");
    assert.equal(status.plan, "trial");
  } finally {
    restoreOffline();
  }
});
