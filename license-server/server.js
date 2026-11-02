#!/usr/bin/env node
"use strict";

/**
 * 授权服务器（在线验证）——卖家自建、卖家控制
 * ------------------------------------------------------------
 * 作用：发码、验码、绑定机器、吊销、管订阅。真正的私密信息只在这台服务器上，
 *      桌面软件只把“激活码 + 机器指纹”发过来，由这里裁决并回授权状态。
 *
 * 运行：先设置环境变量再启动（Windows PowerShell 示例）：
 *   $env:LICENSE_ADMIN_TOKEN = "换成你自定的管理口令"
 *   $env:LICENSE_PORT = "3400"
 *   node server.js
 *
 * 依赖：无第三方依赖，只需 Node 18+（自带 http / crypto / fs）。
 * 数据：默认存到 ./data/licenses.json，请勿提交到公开仓库。
 */

const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.LICENSE_PORT || 3400);
const ADMIN_TOKEN = (process.env.LICENSE_ADMIN_TOKEN || "").trim();
const DATA_DIR = process.env.LICENSE_DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "licenses.json");

if (!ADMIN_TOKEN) {
  console.error(
    "[license-server] 缺少卖家管理口令。请先设置环境变量：\n" +
    "  例：$env:LICENSE_ADMIN_TOKEN = \"换成你自定的管理口令\"\n" +
    "然后重新运行 node server.js",
  );
  process.exit(1);
}

/* ---------------- 数据存取（单文件 JSON，原子写） ---------------- */
function readDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
      return { records: Array.isArray(parsed.records) ? parsed.records : [] };
    }
  } catch (error) {
    console.error("[license-server] 读取数据文件失败：", error.message);
  }
  return { records: [] };
}

function writeDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmp, DB_FILE);
}

/* ---------------- 工具 ---------------- */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(buf) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function makeCode() {
  const raw = base32(crypto.randomBytes(15)).slice(0, 20);
  const groups = [];
  for (let i = 0; i < raw.length; i += 4) {
    groups.push(raw.slice(i, i + 4));
  }
  return `NV-${groups.join("-")}`;
}

function editionOf(value) {
  return value === "premium" ? "premium" : value === "standard" ? "standard" : null;
}

function purposeOf(value) {
  return value === "activate" ? "activate" : value === "upgrade" ? "upgrade" : null;
}

function remainingDays(expiresAt) {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
}

function trialStatus(fingerprint) {
  return {
    activated: false,
    bound: false,
    edition: "none",
    machineFingerprint: fingerprint,
    activatedAt: null,
    plan: "trial",
    expiresAt: null,
    remainingDays: null,
    expired: false,
    price: null,
  };
}

function statusForRecord(rec) {
  const days = remainingDays(rec.expiresAt);
  return {
    activated: true,
    bound: true,
    edition: rec.edition,
    machineFingerprint: rec.boundFingerprint,
    activatedAt: rec.activatedAt,
    plan: rec.edition,
    expiresAt: rec.expiresAt,
    remainingDays: days,
    expired: rec.expiresAt ? days < 0 : false,
    price: rec.price ?? null,
  };
}

function findActiveForFingerprint(db, fingerprint) {
  return db.records.find((r) => !r.revoked && r.boundFingerprint === fingerprint);
}

function plusDays(fromIso, days) {
  const d = new Date(fromIso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/* ---------------- 业务逻辑 ---------------- */

function issue(edition, purpose, durationDays, price, note) {
  const db = readDb();
  const code = makeCode();
  db.records.push({
    code,
    edition,
    purpose,
    durationDays: durationDays > 0 ? durationDays : 0,
    price: price ?? null,
    note: note ?? null,
    issuedAt: new Date().toISOString(),
    boundFingerprint: null,
    activatedAt: null,
    expiresAt: null,
    revoked: false,
  });
  writeDb(db);
  return code;
}

function activate(db, code, fingerprint) {
  const rec = db.records.find((r) => r.code === code);
  if (!rec || rec.revoked) {
    throw new Error("激活码无效或已被吊销。");
  }
  if (rec.purpose !== "activate") {
    throw new Error("这是升级码，请在“升级”入口使用。");
  }
  if (rec.boundFingerprint && rec.boundFingerprint !== fingerprint) {
    throw new Error("该激活码已绑定到其他电脑，无法在本机使用。");
  }
  const nowIso = new Date().toISOString();
  rec.boundFingerprint = fingerprint;
  rec.activatedAt = nowIso;
  rec.expiresAt = rec.durationDays > 0 ? plusDays(nowIso, rec.durationDays) : null;
  writeDb(db);
  return statusForRecord(rec);
}

function upgrade(db, code, fingerprint) {
  const active = findActiveForFingerprint(db, fingerprint);
  if (!active) {
    throw new Error("请先完成激活，再使用升级码。");
  }
  const rec = db.records.find((r) => r.code === code);
  if (!rec || rec.revoked) {
    throw new Error("升级码无效或已被吊销。");
  }
  if (rec.purpose !== "upgrade") {
    throw new Error("这是激活码，请在“激活”入口使用。");
  }
  if (rec.edition !== "premium") {
    throw new Error("升级码档位不正确。");
  }
  if (rec.boundFingerprint && rec.boundFingerprint !== fingerprint) {
    throw new Error("该升级码已绑定到其他电脑。");
  }
  const nowIso = new Date().toISOString();
  rec.boundFingerprint = fingerprint;
  rec.activatedAt = rec.activatedAt || nowIso;
  rec.revoked = true; // 升级码一次性使用
  active.edition = "premium";
  active.expiresAt = rec.durationDays > 0 ? plusDays(nowIso, rec.durationDays) : active.expiresAt;
  active.price = rec.price ?? active.price;
  writeDb(db);
  return statusForRecord(active);
}

/* ---------------- HTTP 服务 ---------------- */

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error("请求体过大。"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("请求体不是合法 JSON。"));
      }
    });
    req.on("error", reject);
  });
}

function send(res, statusCode, payload) {
  const json = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, x-admin-token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(json);
}

function ok(res, data, message) {
  send(res, 200, { success: true, data, message });
}

function fail(res, statusCode, error) {
  send(res, statusCode, { success: false, error });
}

function isAdmin(req) {
  return (req.headers["x-admin-token"] || "") === ADMIN_TOKEN;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    if (req.method === "OPTIONS") {
      send(res, 204, {});
      return;
    }

    const fingerprint = (url.searchParams.get("fingerprint") || "").trim();
    const body = req.method === "POST" ? await readBody(req) : {};

    // ---- 公共接口：桌面软件调用 ----
    if (req.method === "GET" && pathname === "/api/license/status") {
      if (!fingerprint) return fail(res, 400, "缺少机器指纹。");
      const db = readDb();
      const active = findActiveForFingerprint(db, fingerprint);
      return ok(res, active ? statusForRecord(active) : trialStatus(fingerprint));
    }

    if (req.method === "POST" && pathname === "/api/license/activate") {
      const { code, fingerprint: fp } = body;
      if (!code || !fp) return fail(res, 400, "缺少激活码或机器指纹。");
      const db = readDb();
      const status = activate(db, String(code).trim(), String(fp));
      return ok(res, status, "激活成功。");
    }

    if (req.method === "POST" && pathname === "/api/license/upgrade") {
      const { code, fingerprint: fp } = body;
      if (!code || !fp) return fail(res, 400, "缺少升级码或机器指纹。");
      const db = readDb();
      const status = upgrade(db, String(code).trim(), String(fp));
      return ok(res, status, "升级成功。");
    }

    if (req.method === "POST" && pathname === "/api/license/verify") {
      const { fingerprint: fp } = body;
      if (!fp) return fail(res, 400, "缺少机器指纹。");
      const db = readDb();
      const active = findActiveForFingerprint(db, String(fp));
      return ok(res, active ? statusForRecord(active) : trialStatus(String(fp)));
    }

    // ---- 卖家管理接口：需要管理口令 ----
    if (pathname.startsWith("/api/license/admin/") && !isAdmin(req)) {
      return fail(res, 401, "管理口令不正确。");
    }

    if (req.method === "POST" && pathname === "/api/license/admin/issue") {
      const { edition, purpose, durationDays, price, note } = body;
      const e = editionOf(edition);
      const p = purposeOf(purpose);
      if (!e || !p) return fail(res, 400, "档位或用途不正确（edition=standard|premium，purpose=activate|upgrade）。");
      const duration = Number(durationDays) || 0;
      const code = issue(e, p, duration, price == null ? null : Number(price), note ? String(note) : null);
      return ok(res, { code, edition: e, purpose: p, durationDays: duration, price: price == null ? null : Number(price), note: note ?? null });
    }

    if (req.method === "POST" && pathname === "/api/license/admin/revoke") {
      const { code } = body;
      if (!code) return fail(res, 400, "缺少激活码。");
      const db = readDb();
      const rec = db.records.find((r) => r.code === String(code).trim());
      if (!rec) return fail(res, 404, "找不到该激活码。");
      rec.revoked = true;
      writeDb(db);
      return ok(res, { code: rec.code, revoked: true }, "已吊销。");
    }

    if (req.method === "GET" && pathname === "/api/license/admin/list") {
      const db = readDb();
      const list = db.records.map((r) => ({
        code: r.code,
        edition: r.edition,
        purpose: r.purpose,
        durationDays: r.durationDays,
        price: r.price,
        note: r.note,
        issuedAt: r.issuedAt,
        boundFingerprint: r.boundFingerprint,
        activatedAt: r.activatedAt,
        expiresAt: r.expiresAt,
        revoked: r.revoked,
      }));
      return ok(res, list);
    }

    return fail(res, 404, "接口不存在。");
  } catch (error) {
    return fail(res, 400, error.message || "请求处理失败。");
  }
});

server.listen(PORT, () => {
  console.log(`[license-server] 已启动：http://localhost:${PORT}`);
  console.log(`[license-server] 数据文件：${DB_FILE}`);
  console.log("[license-server] 请勿把数据文件或管理口令提交到公开仓库。");
});
