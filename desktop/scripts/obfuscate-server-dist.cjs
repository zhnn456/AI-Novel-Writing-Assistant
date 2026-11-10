#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

/**
 * 加固第一步（A）：对服务端授权相关模块做混淆后再随桌面端分发。
 * 加固第二步（B）：混淆完成后为 dist 生成哈希清单 dist/integrity.json，
 * 清单本身用完整性专用密钥（licenseSecrets.ts 的 DEFAULT_INTEGRITY_SECRET，与授权密钥解耦）做 HMAC。运行时客户端会重算哈希，
 * 对不上就把授权降级为体验态（每本书 3 章），但不退出、不锁死。
 *
 * 注意顺序：必须先混淆、后生成清单。清单一变，旧包的哈希全对不上。
 */

// 混淆范围：授权判断链路（改一行就能解锁的地方）+ 导出（溯源）。
// 其余自有代码不混淆，但会进清单：改了同样会被 B 发现。
const OBFUSCATE_GLOBS = [
  "modules/license",
  "modules/export/novelExport.service.js",
  "modules/export/http/novelExport.js",
  "middleware/auth.js",
  "middleware/licenseLimit.js",
];

// 清单范围：整个 dist 自有代码（把「改一处绕过」变成「必然留痕并降级」）。
const MANIFEST_SKIP_PREFIX = ["integrity.json", "node_modules/"];

const MARKER = "/*b1*/";
const OPTIONS = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: "hexadecimal",
  log: false,
  numbersToExpressions: false,
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  splitStrings: false,
  stringArray: true,
  stringArrayCallsTransform: false,
  stringArrayEncoding: ["base64"],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 0.75,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
  target: "node",
  sourceMap: false,
};

function resolveObfuscator() {
  try {
    return require("javascript-obfuscator");
  } catch (error) {
    throw new Error(
      "缺少 javascript-obfuscator，请先在仓库根目录执行 pnpm add -Dw javascript-obfuscator",
    );
  }
}

function collectJsFiles(distDir, relativeGlob) {
  const absolute = path.join(distDir, relativeGlob);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return absolute.endsWith(".js") ? [absolute] : [];
  const out = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(absolute, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectJsFiles(distDir, path.join(relativeGlob, entry.name)));
    } else if (entry.name.endsWith(".js")) {
      out.push(child);
    }
  }
  return out;
}

function obfuscateServerDist(distDir) {
  if (!distDir || !fs.existsSync(distDir)) {
    throw new Error(`服务端产物目录不存在：${distDir}`);
  }
  const obfuscator = resolveObfuscator();
  const files = new Set();
  for (const glob of OBFUSCATE_GLOBS) {
    for (const file of collectJsFiles(distDir, glob)) files.add(file);
  }

  let processed = 0;
  let skipped = 0;
  for (const filePath of files) {
    const source = fs.readFileSync(filePath, "utf8");
    if (source.startsWith(MARKER)) {
      skipped += 1;
      continue;
    }
    const result = obfuscator.obfuscate(source, OPTIONS).getObfuscatedCode();
    fs.writeFileSync(filePath, `${MARKER}${result}`, "utf8");
    processed += 1;
  }

  console.log(`[obfuscate] 已处理 ${processed} 个文件，跳过 ${skipped} 个已混淆文件：${distDir}`);
  return { processed, skipped };
}

function resolveIntegritySecret() {
  // 与 server/src/modules/license/licenseSecrets.ts 的 DEFAULT_INTEGRITY_SECRET 保持一致。
  // 旧种子 ai-novel-license-seed-2026 已在 0.5.30 取证中泄露，禁止复用。
  return (process.env.AI_NOVEL_INTEGRITY_SECRET || "").trim()
    || "bb5492a1ef81a2e35c3bc07a362a5b88a3e211f1c2caf3dd";
}

function canonical(files) {
  return JSON.stringify(files.map((f) => [f.path, f.sha256]).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}

function walkAll(distDir, dir = distDir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkAll(distDir, absolute, out);
    } else {
      const relative = path.relative(distDir, absolute).split(path.sep).join("/");
      if (MANIFEST_SKIP_PREFIX.some((prefix) => relative.startsWith(prefix))) continue;
      if (relative.endsWith(".tsbuildinfo") || relative.endsWith(".map")) continue;
      out.push(absolute);
    }
  }
  return out;
}

/**
 * 生成 dist/integrity.json。runtime 端（server/src/modules/license/integrity.ts）
 * 用同样的规则重算：路径相对 dist、排除 integrity.json 自身。
 */
function writeIntegrityManifest(distDir) {
  const files = walkAll(distDir).map((absolute) => ({
    path: path.relative(distDir, absolute).split(path.sep).join("/"),
    sha256: crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex"),
  }));
  const sig = crypto
    .createHmac("sha256", resolveIntegritySecret())
    .update(canonical(files))
    .digest("hex");
  const manifest = { generatedAt: new Date().toISOString(), files, sig };
  fs.writeFileSync(path.join(distDir, "integrity.json"), JSON.stringify(manifest), "utf8");
  console.log(`[integrity] 清单已写入，共 ${files.length} 个文件：${path.join(distDir, "integrity.json")}`);
  return manifest;
}

module.exports = { obfuscateServerDist, writeIntegrityManifest, OBFUSCATE_GLOBS, MARKER };

if (require.main === module) {
  const target = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, "..", "..", "server", "dist");
  try {
    obfuscateServerDist(target);
    writeIntegrityManifest(target);
  } catch (error) {
    console.error("[obfuscate] failed.", error);
    process.exit(1);
  }
}
