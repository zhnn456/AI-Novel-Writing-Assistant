#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * 对服务端授权相关模块做混淆后再随桌面端分发。
 * 只处理授权/鉴权相关文件，避免拖慢整体打包或影响大模块运行。
 */
const TARGET_FILES = [
  "modules/license/stateStore.js",
  "modules/license/licenseService.js",
  "modules/license/licenseCodec.js",
  "modules/license/fingerprint.js",
  "modules/license/http/licenseRoutes.js",
  "middleware/auth.js",
];

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

function obfuscateServerDist(distDir) {
  if (!distDir || !fs.existsSync(distDir)) {
    throw new Error(`服务端产物目录不存在：${distDir}`);
  }
  const obfuscator = resolveObfuscator();
  let processed = 0;
  let skipped = 0;

  for (const relative of TARGET_FILES) {
    const filePath = path.join(distDir, relative);
    if (!fs.existsSync(filePath)) {
      continue;
    }
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

module.exports = { obfuscateServerDist, TARGET_FILES, MARKER };

if (require.main === module) {
  const target = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, "..", "..", "server", "dist");
  try {
    obfuscateServerDist(target);
  } catch (error) {
    console.error("[obfuscate] failed.", error);
    process.exit(1);
  }
}
