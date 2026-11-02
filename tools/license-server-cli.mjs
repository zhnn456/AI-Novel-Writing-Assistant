#!/usr/bin/env node
"use strict";

/**
 * 授权服务器卖家工具（在线验证用）
 * ------------------------------------------------------------
 * 与 license-server/server.js 配套，帮你发码、吊销、查看已发激活码。
 *
 * 命令行模式：
 *   node tools/license-server-cli.mjs --server http://localhost:3400 --token 管理口令 issue --edition standard --purpose activate --duration 0 --price 99
 *   node tools/license-server-cli.mjs --server http://localhost:3400 --token 管理口令 issue --edition premium --purpose upgrade --duration 365 --price 199
 *   node tools/license-server-cli.mjs --server http://localhost:3400 --token 管理口令 revoke --code NV-XXXX-XXXX-...
 *   node tools/license-server-cli.mjs --server http://localhost:3400 --token 管理口令 list
 *
 * 菜单交互模式（不带参数直接运行）：
 *   node tools/license-server-cli.mjs
 *
 * 环境变量可代替 --server / --token：LICENSE_SERVER_URL、LICENSE_ADMIN_TOKEN
 */

import { createInterface } from "node:readline/promises";

const DEFAULT_SERVER = process.env.LICENSE_SERVER_URL || "http://localhost:3400";
const DEFAULT_TOKEN = process.env.LICENSE_ADMIN_TOKEN || "";

/* ---------------- 请求封装 ---------------- */
async function api(base, token, method, pathname, body) {
  const headers = {};
  if (token) headers["x-admin-token"] = token;
  let payload;
  if (body) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${base}${pathname}`, { method, headers, body: payload });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(json.error || json.message || `请求失败（HTTP ${res.status}）。`);
  }
  return json.data;
}

/* ---------------- CLI 参数解析 ---------------- */
function parseArgs(argv) {
  const opts = { server: DEFAULT_SERVER, token: DEFAULT_TOKEN };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--server") opts.server = argv[++i];
    else if (a === "--token") opts.token = argv[++i];
    else if (a === "--edition") opts.edition = argv[++i];
    else if (a === "--purpose") opts.purpose = argv[++i];
    else if (a === "--duration") opts.duration = Number(argv[++i]);
    else if (a === "--price") opts.price = Number(argv[++i]);
    else if (a === "--code") opts.code = argv[++i];
    else if (a === "--note") opts.note = argv[++i];
    else if (a === "--help" || a === "-h") opts.help = true;
    else rest.push(a);
  }
  opts.command = rest[0];
  return opts;
}

function printHelp() {
  console.log(`
授权服务器卖家工具

用法：
  发激活码（标准版/永久）：
    node tools/license-server-cli.mjs --server http://localhost:3400 --token 管理口令 issue --edition standard --purpose activate --duration 0 --price 99
  发高级版升级码（订阅一年）：
    node tools/license-server-cli.mjs --server http://localhost:3400 --token 管理口令 issue --edition premium --purpose upgrade --duration 365 --price 199
  吊销某激活码：
    node tools/license-server-cli.mjs --server http://localhost:3400 --token 管理口令 revoke --code NV-XXXX-XXXX-...
  查看已发激活码：
    node tools/license-server-cli.mjs --server http://localhost:3400 --token 管理口令 list

参数说明：
  --edition   standard（标准版）| premium（高级版）
  --purpose   activate（激活码）| upgrade（升级码）
  --duration  有效天数，0 或不填 = 永久买断；>0 = 订阅 N 天
  --price     售价（元），仅作记录
  --note      备注（可选，如客户名）
  --server    授权服务器地址，默认 http://localhost:3400
  --token     卖家管理口令（必填，或设环境变量 LICENSE_ADMIN_TOKEN）
  --help      显示本说明

不带参数直接运行会进入菜单交互模式。
`);
}

/* ---------------- 菜单交互 ---------------- */
async function interactive() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => rl.question(q);

  console.log("授权服务器卖家工具（在线验证）");
  console.log(`授权服务器：${DEFAULT_SERVER}`);
  if (!DEFAULT_TOKEN) {
    console.log("警告：未设置管理口令。可用 --token 或在环境变量 LICENSE_ADMIN_TOKEN 中设置。");
  }
  console.log("");
  console.log("你要做什么？");
  console.log("  1）发激活码");
  console.log("  2）发高级版升级码");
  console.log("  3）吊销一个激活码");
  console.log("  4）查看已发激活码");
  const choice = (await ask("请输入序号（1-4）：")).trim();

  if (choice === "1" || choice === "2") {
    const isUpgrade = choice === "2";
    const edition = isUpgrade ? "premium" : "standard";
    const purpose = isUpgrade ? "upgrade" : "activate";
    if (!isUpgrade) {
      console.log(`档位：${edition}，用途：${purpose}`);
    } else {
      console.log(`档位：${edition}，用途：${purpose}`);
    }
    const durRaw = (await ask("有效天数（0 = 永久买断，>0 = 订阅 N 天，回车默认 0）：")).trim();
    const duration = durRaw === "" ? 0 : Number(durRaw);
    const priceRaw = (await ask("售价（元，仅记录，回车可留空）：")).trim();
    const price = priceRaw === "" ? null : Number(priceRaw);
    const note = (await ask("备注（可选，如客户名，回车可留空）：")).trim() || null;
    const token = DEFAULT_TOKEN || (await ask("管理口令：")).trim();
    const server = DEFAULT_SERVER || (await ask("授权服务器地址（回车默认 http://localhost:3400）：")).trim() || DEFAULT_SERVER;
    const code = await api(server, token, "POST", "/api/license/admin/issue", {
      edition, purpose, durationDays: duration, price, note,
    });
    console.log("");
    console.log("已生成，发给客户即可：");
    console.log("------------------------------------------------------------");
    console.log(code.code);
    console.log("------------------------------------------------------------");
    console.log(`档位：${code.edition} · 用途：${code.purpose} · 有效天数：${code.durationDays} · 售价：${code.price ?? "未填"} 元${code.note ? ` · 备注：${code.note}` : ""}`);
  } else if (choice === "3") {
    const code = (await ask("要吊销的激活码：")).trim();
    const token = DEFAULT_TOKEN || (await ask("管理口令：")).trim();
    const server = DEFAULT_SERVER || (await ask("授权服务器地址（回车默认 http://localhost:3400）：")).trim() || DEFAULT_SERVER;
    const result = await api(server, token, "POST", "/api/license/admin/revoke", { code });
    console.log(`已吊销：${result.code}`);
  } else if (choice === "4") {
    const token = DEFAULT_TOKEN || (await ask("管理口令：")).trim();
    const server = DEFAULT_SERVER || (await ask("授权服务器地址（回车默认 http://localhost:3400）：")).trim() || DEFAULT_SERVER;
    const list = await api(server, token, "GET", "/api/license/admin/list", null);
    console.log("");
    console.log(`共 ${list.length} 条：`);
    for (const r of list) {
      console.log(`  ${r.code}  ${r.edition}/${r.purpose}  天数=${r.durationDays}  价=${r.price ?? "-"}  状态=${r.revoked ? "已吊销" : r.activatedAt ? "已激活" : "未激活"}`);
    }
  } else {
    console.log("输入无效。");
  }
  rl.close();
}

/* ---------------- 入口 ---------------- */
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }
  if (!opts.command) {
    await interactive();
    return;
  }
  if (!opts.token) {
    throw new Error("缺少管理口令：请传 --token 或设置环境变量 LICENSE_ADMIN_TOKEN。");
  }
  switch (opts.command) {
    case "issue": {
      const edition = opts.edition === "premium" ? "premium" : "standard";
      const purpose = opts.purpose === "upgrade" ? "upgrade" : "activate";
      const duration = Number(opts.duration) || 0;
      const price = opts.price == null ? null : Number(opts.price);
      const note = opts.note || null;
      const result = await api(opts.server, opts.token, "POST", "/api/license/admin/issue", {
        edition, purpose, durationDays: duration, price, note,
      });
      console.log(result.code);
      console.log(`档位：${result.edition} · 用途：${result.purpose} · 有效天数：${result.durationDays} · 售价：${result.price ?? "未填"} 元${result.note ? ` · 备注：${result.note}` : ""}`);
      break;
    }
    case "revoke": {
      if (!opts.code) throw new Error("revoke 需要 --code 参数。");
      const result = await api(opts.server, opts.token, "POST", "/api/license/admin/revoke", { code: opts.code });
      console.log(`已吊销：${result.code}`);
      break;
    }
    case "list": {
      const list = await api(opts.server, opts.token, "GET", "/api/license/admin/list", null);
      console.log(`共 ${list.length} 条：`);
      for (const r of list) {
        console.log(`  ${r.code}  ${r.edition}/${r.purpose}  天数=${r.durationDays}  价=${r.price ?? "-"}  状态=${r.revoked ? "已吊销" : r.activatedAt ? "已激活" : "未激活"}`);
      }
      break;
    }
    default:
      throw new Error(`未知命令：${opts.command}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
