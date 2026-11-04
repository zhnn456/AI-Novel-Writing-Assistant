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
const DATA_DIR = process.env.LICENSE_DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "licenses.json");

let adminToken = (process.env.LICENSE_ADMIN_TOKEN || "").trim();
const ADMIN_TOKEN_FILE = path.join(DATA_DIR, "admin-token.json");
function loadRuntimeToken() {
  try {
    if (fs.existsSync(ADMIN_TOKEN_FILE)) {
      const saved = JSON.parse(fs.readFileSync(ADMIN_TOKEN_FILE, "utf8"));
      if (saved && typeof saved.token === "string" && saved.token) adminToken = saved.token;
    }
  } catch (error) {
    console.error("[license-server] 读取运行时口令失败：", error.message);
  }
}
loadRuntimeToken();

if (!adminToken) {
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
      return {
        records: Array.isArray(parsed.records) ? parsed.records : [],
        logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      };
    }
  } catch (error) {
    console.error("[license-server] 读取数据文件失败：", error.message);
  }
  return { records: [], logs: [] };
}

function writeDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmp, DB_FILE);
}

/* 审计日志：记录发码/激活/吊销/解绑/改信息/改口令等操作，只保留最近 2000 条。 */
function addLog(db, action, detail) {
  db.logs = db.logs || [];
  db.logs.push({ time: new Date().toISOString(), action, detail: detail ?? null });
  if (db.logs.length > 2000) db.logs = db.logs.slice(-2000);
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

function issue(edition, purpose, durationDays, price, note, customer) {
  const db = readDb();
  const code = makeCode();
  db.records.push({
    code,
    edition,
    purpose,
    durationDays: durationDays > 0 ? durationDays : 0,
    price: price ?? null,
    note: note ?? null,
    customer: customer || null,
    issuedAt: new Date().toISOString(),
    boundFingerprint: null,
    activatedAt: null,
    expiresAt: null,
    revoked: false,
  });
  addLog(db, "issue", `${edition}/${purpose} ${code}${customer ? "（客户:" + customer + "）" : ""}`);
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
  addLog(db, "activate", `${rec.code} 已在机器 ${fingerprint.slice(0, 8)}… 激活`);
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
  addLog(db, "upgrade", `${rec.code} 升级 ${active.code} 至 premium`);
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
  return (req.headers["x-admin-token"] || "") === adminToken;
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
      const { edition, purpose, durationDays, price, note, customer } = body;
      const e = editionOf(edition);
      const p = purposeOf(purpose);
      if (!e || !p) return fail(res, 400, "档位或用途不正确（edition=standard|premium，purpose=activate|upgrade）。");
      const duration = Number(durationDays) || 0;
      const code = issue(e, p, duration, price == null ? null : Number(price), note ? String(note) : null, customer ? String(customer) : null);
      return ok(res, { code, edition: e, purpose: p, durationDays: duration, price: price == null ? null : Number(price), note: note ?? null, customer: customer ?? null });
    }

    if (req.method === "POST" && pathname === "/api/license/admin/revoke") {
      const { code } = body;
      if (!code) return fail(res, 400, "缺少激活码。");
      const db = readDb();
      const rec = db.records.find((r) => r.code === String(code).trim());
      if (!rec) return fail(res, 404, "找不到该激活码。");
      rec.revoked = true;
      addLog(db, "revoke", `${rec.code} 已吊销`);
      writeDb(db);
      return ok(res, { code: rec.code, revoked: true }, "已吊销。");
    }

    if (req.method === "POST" && pathname === "/api/license/admin/unbind") {
      const { code } = body;
      if (!code) return fail(res, 400, "缺少激活码。");
      const db = readDb();
      const rec = db.records.find((r) => r.code === String(code).trim());
      if (!rec) return fail(res, 404, "找不到该激活码。");
      if (!rec.boundFingerprint) return fail(res, 400, "该激活码尚未绑定机器。");
      rec.boundFingerprint = null;
      rec.activatedAt = null;
      rec.expiresAt = null;
      addLog(db, "unbind", `${rec.code} 解除绑定，可换机重新激活`);
      writeDb(db);
      return ok(res, { code: rec.code, unbound: true }, "已解除绑定，可在新机器上重新激活。");
    }

    if (req.method === "POST" && pathname === "/api/license/admin/update") {
      const { code } = body;
      if (!code) return fail(res, 400, "缺少激活码。");
      const db = readDb();
      const rec = db.records.find((r) => r.code === String(code).trim());
      if (!rec) return fail(res, 404, "找不到该激活码。");
      if (body.note !== undefined) rec.note = body.note === "" ? null : String(body.note);
      if (body.customer !== undefined) rec.customer = body.customer === "" ? null : String(body.customer);
      if (body.price !== undefined) rec.price = body.price === "" || body.price == null ? null : Number(body.price);
      addLog(db, "update", `${rec.code} 修改信息`);
      writeDb(db);
      return ok(res, { code: rec.code, note: rec.note, customer: rec.customer, price: rec.price }, "已更新。");
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
        customer: r.customer || null,
        issuedAt: r.issuedAt,
        boundFingerprint: r.boundFingerprint,
        activatedAt: r.activatedAt,
        expiresAt: r.expiresAt,
        revoked: r.revoked,
      }));
      return ok(res, list);
    }

    if (req.method === "GET" && pathname === "/api/license/admin/logs") {
      const db = readDb();
      return ok(res, (db.logs || []).slice().reverse());
    }

    if (req.method === "GET" && pathname === "/api/license/admin/stats") {
      const db = readDb();
      const now = Date.now();
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      let total = 0, activated = 0, premiumActivated = 0, revoked = 0, expired = 0, valid = 0, revenue = 0, revenueMonth = 0;
      const monthlyMap = {};
      const expirySoon7 = [], expirySoon30 = [];
      for (const r of db.records) {
        total++;
        if (r.revoked) { revoked++; continue; }
        valid++;
        const expiredNow = r.activatedAt && r.expiresAt && new Date(r.expiresAt).getTime() < now;
        if (expiredNow) expired++;
        if (r.activatedAt) {
          activated++;
          if (r.edition === "premium") premiumActivated++;
          if (r.price != null) {
            revenue += Number(r.price);
            const act = new Date(r.activatedAt);
            if (act >= monthStart) revenueMonth += Number(r.price);
            const key = act.getFullYear() + "-" + String(act.getMonth() + 1).padStart(2, "0");
            monthlyMap[key] = (monthlyMap[key] || 0) + Number(r.price);
          }
          if (r.expiresAt) {
            const days = Math.ceil((new Date(r.expiresAt).getTime() - now) / 86400000);
            if (days >= 0 && days <= 7) expirySoon7.push({ code: r.code, edition: r.edition, expiresAt: r.expiresAt, days });
            if (days >= 0 && days <= 30) expirySoon30.push({ code: r.code, edition: r.edition, expiresAt: r.expiresAt, days });
          }
        }
      }
      const monthly = Object.keys(monthlyMap).sort().map((k) => ({ month: k, revenue: Math.round(monthlyMap[k] * 100) / 100 }));
      return ok(res, { total, activated, premiumActivated, revoked, expired, valid, revenue, revenueMonth, monthly, expirySoon7, expirySoon30 });
    }

    if (req.method === "POST" && pathname === "/api/license/admin/token") {
      const { current, newToken } = body;
      if (String(current || "") !== adminToken) return fail(res, 403, "当前口令不正确。");
      const nt = String(newToken || "").trim();
      if (nt.length < 16) return fail(res, 400, "新口令长度至少 16 位。");
      adminToken = nt;
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${ADMIN_TOKEN_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ token: nt, updatedAt: new Date().toISOString() }, null, 2), "utf8");
      fs.renameSync(tmp, ADMIN_TOKEN_FILE);
      const db = readDb();
      addLog(db, "token", "修改管理口令");
      writeDb(db);
      return ok(res, { changed: true }, "管理口令已修改。");
    }

    // ---- Web 管理后台页面（同源静态页面，数据接口靠 x-admin-token 鉴权）----
    if (req.method === "GET" && (pathname === "/admin" || pathname === "/admin/")) {
      const adminHtml = path.join(__dirname, "admin", "index.html");
      if (!fs.existsSync(adminHtml)) return fail(res, 404, "管理后台页面缺失：admin/index.html");
      const html = fs.readFileSync(adminHtml, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);
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
