const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { initializeTemporarySqliteDatabase } = require("../../tests/testInfrastructure/tempSqliteDatabase.cjs");

// Windows 的动态端口范围在这台机器上被设为 1024-15000，listen(0) 偶尔会分到
// undici 视为「bad port」的端口（如 6000/6666/10080 等），fetch 会直接抛
// TypeError: fetch failed (bad port)，看起来像业务 500。测试里给 listen(0)
// 换成安全端口，避免这类与代码无关的偶发红灯。
const UNDICI_BAD_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102,
  103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465,
  512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993,
  995, 1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669,
  6679, 6697, 10080,
]);
if (!net.Server.prototype.__anwSafeListen) {
  const originalListen = net.Server.prototype.listen;
  const pickPort = () => {
    let candidate;
    do {
      candidate = 20000 + Math.floor(Math.random() * 40000);
    } while (UNDICI_BAD_PORTS.has(candidate));
    return candidate;
  };
  const safeListen = function (port, ...rest) {
    if (port !== 0) {
      return originalListen.call(this, port, ...rest);
    }
    const attempt = () => {
      const onError = (error) => {
        if (error && error.code === "EADDRINUSE") {
          this.removeListener("error", onError);
          attempt();
        }
      };
      this.once("error", onError);
      originalListen.call(this, pickPort(), ...rest);
    };
    attempt();
    return this;
  };
  safeListen.__anwSafeListen = true;
  net.Server.prototype.listen = safeListen;
}

// Never migrate an inherited DATABASE_URL. Each execution process owns a new
// directory, including the coordinator and reviewed isolation=none batches.
// Test modules can subsequently select their own (even deliberately empty) DB.
if (process.env.ANW_TEST_SKIP_SQLITE_PRELOAD === "1") {
  process.env.NODE_ENV = "test";
  console.log(`[test-sqlite] skipped preload for fixture pid=${process.pid}`);
} else {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "anw-suite-sqlite-"));
  const databaseUrl = initializeTemporarySqliteDatabase(root, "tests.sqlite");
  process.env.NODE_ENV = "test";
  process.env.AI_NOVEL_DATABASE_MODE = "sqlite";
  process.env.AI_NOVEL_APP_DATA_DIR = root;
  process.env.DATABASE_URL = databaseUrl;
  console.log(`[test-sqlite] ${JSON.stringify({ pid: process.pid, databaseUrl })}`);
}
