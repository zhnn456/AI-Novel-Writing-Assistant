#!/usr/bin/env node
/**
 * 卖家离线发码工具（升级版）
 *
 * 支持两种用法：
 *   1) 菜单交互式：直接运行，按提示一步步选（推荐，无需记参数）
 *   2) 命令行参数：
 *        node tools/license-generator.mjs --edition standard --purpose activate --duration 0 --price 99
 *        node tools/license-generator.mjs --edition premium --purpose upgrade --duration 365 --price 199
 *        node tools/license-generator.mjs --inspect <码>
 *
 * 参数说明：
 *   --edition  standard | premium      版本（标准版 / 高级版）
 *   --purpose  activate | upgrade      用途（激活码 / 升级码）
 *   --duration <天数>                   时效，0 或省略 = 永久（买断）
 *   --price    <元>                    售价，仅记录与展示用，可省略
 *
 * 可选环境变量：AI_NOVEL_LICENSE_SECRET（与软件内置校验密钥一致；不设置则用默认值）
 */
import crypto from "node:crypto";
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DEFAULT_SECRET = "ai-novel-license-seed-2026";

function secret() {
  return process.env.AI_NOVEL_LICENSE_SECRET?.trim() || DEFAULT_SECRET;
}

function base32Encode(buffer) {
  const result = [];
  let value = 0;
  let bits = 0;
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result.push(BASE32_ALPHABET[(value >>> (bits - 5)) & 31]);
      bits -= 5;
    }
  }
  if (bits > 0) {
    result.push(BASE32_ALPHABET[(value << (5 - bits)) & 31]);
  }
  return result.join("");
}

function base32Decode(input) {
  const cleaned = input.replace(/=+$/g, "");
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char.toUpperCase());
    if (index === -1) throw new Error("激活码包含非法字符。");
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function sign(body) {
  return base32Encode(crypto.createHmac("sha256", secret()).update(body).digest().subarray(0, 10));
}

function build(payload) {
  const body = base32Encode(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}-${sign(body)}`;
}

function inspect(code) {
  const normalized = String(code).trim().replace(/\s+/g, "");
  const dash = normalized.lastIndexOf("-");
  if (dash <= 0) throw new Error("激活码格式不正确。");
  const body = normalized.slice(0, dash);
  const sig = normalized.slice(dash + 1);
  const expected = sign(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw new Error("签名不匹配（密钥不一致或码被篡改）。");
  }
  return JSON.parse(base32Decode(body).toString("utf8"));
}

const EDITION_TEXT = { standard: "标准版", premium: "高级版" };
const PURPOSE_TEXT = { activate: "激活码", upgrade: "升级码" };

function describeDuration(duration) {
  return duration && duration > 0 ? `${duration} 天` : "永久（买断）";
}

function printResult(code, payload) {
  const price = payload.price ? `¥ ${payload.price}` : "未定价";
  console.log("\n────────────────────────────────────────────");
  console.log(`  生成的${PURPOSE_TEXT[payload.purpose]}（${EDITION_TEXT[payload.edition]}）`);
  console.log("────────────────────────────────────────────");
  console.log(`\n${code}\n`);
  console.log(`  版本：${EDITION_TEXT[payload.edition]}`);
  console.log(`  用途：${PURPOSE_TEXT[payload.purpose]}`);
  console.log(`  时效：${describeDuration(payload.duration)}`);
  console.log(`  售价：${price}`);
  console.log("\n  发给客户：复制上面那串码即可。");
  console.log("────────────────────────────────────────────\n");
}

async function ask(question) {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  return answer.trim();
}

async function interactive() {
  console.log("\n  AI 小说工作台 · 离线发码工具（菜单式）");
  console.log("  直接输入数字或文字，一路回车即可。\n");

  const purposeAnswer = (await ask("  用途：\n    1) 激活码（首次激活）\n    2) 升级码（升到高级版）\n  请选择 [1/2]：")).toLowerCase();
  const purpose = purposeAnswer.startsWith("2") ? "upgrade" : "activate";

  let edition = "standard";
  if (purpose === "activate") {
    const editionAnswer = (await ask("\n  版本：\n    1) 标准版\n    2) 高级版\n  请选择 [1/2]：")).toLowerCase();
    edition = editionAnswer.startsWith("2") ? "premium" : "standard";
  } else {
    edition = "premium";
  }

  const durationRaw = (await ask("\n  时效（天数，0 或直接回车 = 永久买断）：")).trim();
  let duration = 0;
  if (durationRaw !== "" && /^\d+$/.test(durationRaw)) {
    duration = Number(durationRaw);
  }

  const priceRaw = (await ask("\n  售价（元，可直接回车跳过）：")).trim();
  let price;
  if (priceRaw !== "" && /^\d+(\.\d+)?$/.test(priceRaw)) {
    price = Number(priceRaw);
  }

  const payload = {
    edition,
    purpose,
    issuedAt: new Date().toISOString(),
    nonce: crypto.randomBytes(6).toString("hex"),
  };
  if (duration > 0) payload.duration = duration;
  if (price != null) payload.price = price;

  printResult(build(payload), payload);
}

function usage() {
  console.log([
    "用法：",
    "  菜单式      node tools/license-generator.mjs",
    "  生成激活码  node tools/license-generator.mjs --edition standard --purpose activate --duration 0 --price 99",
    "  生成升级码  node tools/license-generator.mjs --edition premium --purpose upgrade --duration 365 --price 199",
    "  查看内容    node tools/license-generator.mjs --inspect <码>",
    "可选：AI_NOVEL_LICENSE_SECRET=<与软件一致的密钥> 前缀命令",
  ].join("\n"));
}

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

if (args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(0);
}

if (args.includes("--inspect")) {
  const code = args[args.indexOf("--inspect") + 1];
  try {
    const payload = inspect(code);
    console.log(`版本：${EDITION_TEXT[payload.edition]}  用途：${PURPOSE_TEXT[payload.purpose]}`);
    console.log(`时效：${describeDuration(payload.duration)}  售价：${payload.price ? `¥ ${payload.price}` : "未定价"}`);
    console.log(`生成时间：${payload.issuedAt}`);
  } catch (error) {
    console.error("检查失败：", error.message);
    process.exit(1);
  }
  process.exit(0);
}

// 没有参数 → 菜单交互式
if (args.length === 0) {
  interactive().catch((error) => {
    console.error("生成失败：", error.message);
    process.exit(1);
  });
} else {
  // 命令行参数模式
  const edition = flag("--edition");
  const purpose = flag("--purpose");
  if (edition !== "standard" && edition !== "premium") {
    console.error("--edition 只能是 standard 或 premium。");
    usage();
    process.exit(1);
  }
  if (purpose !== "activate" && purpose !== "upgrade") {
    console.error("--purpose 只能是 activate 或 upgrade。");
    usage();
    process.exit(1);
  }

  const durationRaw = flag("--duration");
  let duration = 0;
  if (durationRaw !== undefined && /^\d+$/.test(durationRaw)) {
    duration = Number(durationRaw);
  }
  const priceRaw = flag("--price");
  let price;
  if (priceRaw !== undefined && /^\d+(\.\d+)?$/.test(priceRaw)) {
    price = Number(priceRaw);
  }

  const payload = {
    edition,
    purpose,
    issuedAt: new Date().toISOString(),
    nonce: crypto.randomBytes(6).toString("hex"),
  };
  if (duration > 0) payload.duration = duration;
  if (price != null) payload.price = price;

  printResult(build(payload), payload);
}
