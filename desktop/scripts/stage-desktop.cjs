const fs = require("node:fs");
const path = require("node:path");
const { execSync, spawnSync } = require("node:child_process");
const { createRequire } = require("node:module");
const { obfuscateServerDist, writeIntegrityManifest } = require("./obfuscate-server-dist.cjs");

const repoRoot = path.resolve(__dirname, "..", "..");
const desktopDir = path.resolve(__dirname, "..");
const buildDir = path.join(desktopDir, "build");
const appDir = path.join(buildDir, "app");
const resourcesDir = path.join(buildDir, "resources");
const appUpdateConfigPath = path.join(resourcesDir, "app-update.yml");
const clientSourceDir = path.join(repoRoot, "client", "dist");
const clientTargetDir = path.join(resourcesDir, "client", "dist");
const serverEntry = path.join(appDir, "node_modules", "@ai-novel", "server", "dist", "app.js");
const desktopMainEntry = path.join(appDir, "dist", "main.js");
const stagedNodeModulesDir = path.join(appDir, "node_modules");
const stagedNativePackagesToDetach = ["better-sqlite3"];
const prismaClientEntrypointFiles = [
  { fileName: "default.js", generatedEntry: "./generated-client/default" },
  { fileName: "index.js", generatedEntry: "./generated-client/index" },
  { fileName: "edge.js", generatedEntry: "./generated-client/edge" },
];

function runPnpm(args, cwd = repoRoot) {
  const command = `pnpm ${args.map((arg) => `"${arg}"`).join(" ")}`;
  execSync(command, {
    cwd,
    stdio: "inherit",
    env: process.env,
    shell: true,
  });
}

function ensureCleanDir(targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
}

function ensureDir(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// 本机环境中 node 的 fs.cpSync 递归拷贝会触发 0xC0000142（DLL 初始化失败）硬崩，疑似杀软钩子所致。
// 因此所有递归目录拷贝改用原生 robocopy（独立进程），spawnSync 拉 robocopy 已验证不会崩。
function robocopy(sourceDir, targetDir) {
  const result = spawnSync(
    "robocopy",
    [sourceDir, targetDir, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NP", "/R:1", "/W:1"],
    { stdio: "inherit" },
  );
  const exitCode = result.status === null ? -999 : result.status;
  if (exitCode >= 8) {
    throw new Error(`robocopy 失败（exit code ${exitCode}）：${sourceDir} -> ${targetDir}`);
  }
}

function copyDirectory(sourceDir, targetDir) {
  robocopy(sourceDir, targetDir);
}

function replaceDirectoryWithPhysicalCopy(targetDir) {
  const tempDir = `${targetDir}.__detached__`;
  fs.rmSync(tempDir, { recursive: true, force: true });
  robocopy(targetDir, tempDir);
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.renameSync(tempDir, targetDir);
}

function replaceFileContents(targetPath, contents) {
  fs.rmSync(targetPath, { force: true });
  fs.writeFileSync(targetPath, contents, "utf8");
}

function writeDesktopUpdaterConfig() {
  // 自建更新通道：桌面版统一从香港源拉清单，与 electron-builder.config.cjs 的 publish 保持一致。
  const updateUrl = firstNonEmpty(process.env.AI_NOVEL_UPDATE_URL, "https://keygate.de5.net/whale/files/");
  const config = [
    "provider: generic",
    `url: ${updateUrl}`,
    "updaterCacheDirName: '@ai-noveldesktop-updater'",
    "",
  ].join("\n");
  fs.writeFileSync(appUpdateConfigPath, config, "utf8");
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function resolveWorkspacePrismaGeneratedDir() {
  const pnpmVirtualStoreDir = path.join(repoRoot, "node_modules", ".pnpm");
  assertExists(pnpmVirtualStoreDir, "workspace virtual store");

  const prismaClientStoreEntries = fs
    .readdirSync(pnpmVirtualStoreDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("@prisma+client@"));

  for (const entry of prismaClientStoreEntries) {
    const generatedDir = path.join(pnpmVirtualStoreDir, entry.name, "node_modules", ".prisma");
    if (fs.existsSync(path.join(generatedDir, "client", "default.js"))) {
      return generatedDir;
    }
  }

  throw new Error(`Expected a generated Prisma runtime directory under ${pnpmVirtualStoreDir}, but none was found.`);
}

function resolveStagedPrismaClientPackageDirs() {
  const pnpmVirtualStoreDir = path.join(stagedNodeModulesDir, ".pnpm");
  assertExists(pnpmVirtualStoreDir, "staged virtual store");

  const prismaClientStoreEntries = fs
    .readdirSync(pnpmVirtualStoreDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("@prisma+client@"));

  if (prismaClientStoreEntries.length === 0) {
    throw new Error("Expected at least one staged @prisma/client package in the virtual store.");
  }

  return prismaClientStoreEntries.map((entry) => ({
    storeEntryName: entry.name,
    packageDir: path.join(pnpmVirtualStoreDir, entry.name, "node_modules", "@prisma", "client"),
  }));
}

function resolveStagedPackageDirsByName(packageName) {
  const pnpmVirtualStoreDir = path.join(stagedNodeModulesDir, ".pnpm");
  assertExists(pnpmVirtualStoreDir, "staged virtual store");

  const matches = fs
    .readdirSync(pnpmVirtualStoreDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${packageName}@`))
    .map((entry) => path.join(pnpmVirtualStoreDir, entry.name, "node_modules", packageName))
    .filter((packageDir) => fs.existsSync(packageDir));

  return Array.from(new Set(matches));
}

function patchPrismaClientEntrypoint(entrypointPath, generatedEntry) {
  const entrypointSource = `module.exports = {
  ...require('${generatedEntry}'),
}
`;

  replaceFileContents(entrypointPath, entrypointSource);
}

function embedPrismaGeneratedClient(prismaClientPackageDir, generatedPrismaDir) {
  const generatedPrismaClientDir = path.join(generatedPrismaDir, "client");
  const embeddedGeneratedClientDir = path.join(prismaClientPackageDir, "generated-client");
  const prismaClientPackageJsonPath = path.join(prismaClientPackageDir, "package.json");
  const prismaClientPackageJson = JSON.parse(fs.readFileSync(prismaClientPackageJsonPath, "utf8"));

  copyDirectory(generatedPrismaClientDir, embeddedGeneratedClientDir);

  if (!Array.isArray(prismaClientPackageJson.files)) {
    prismaClientPackageJson.files = [];
  }
  if (!prismaClientPackageJson.files.includes("generated-client")) {
    prismaClientPackageJson.files.push("generated-client");
  }

  replaceFileContents(prismaClientPackageJsonPath, `${JSON.stringify(prismaClientPackageJson, null, 2)}\n`);

  for (const { fileName, generatedEntry } of prismaClientEntrypointFiles) {
    patchPrismaClientEntrypoint(path.join(prismaClientPackageDir, fileName), generatedEntry);
  }
}

function syncPrismaRuntime() {
  const generatedPrismaDir = resolveWorkspacePrismaGeneratedDir();
  const stagedTopLevelPrismaDir = path.join(stagedNodeModulesDir, ".prisma");
  const stagedPrismaClientPackages = resolveStagedPrismaClientPackageDirs();

  copyDirectory(generatedPrismaDir, stagedTopLevelPrismaDir);

  for (const { storeEntryName, packageDir } of stagedPrismaClientPackages) {
    const nestedPrismaDir = path.join(stagedNodeModulesDir, ".pnpm", storeEntryName, "node_modules", ".prisma");
    const packageLocalPrismaDir = path.join(
      stagedNodeModulesDir,
      ".pnpm",
      storeEntryName,
      "node_modules",
      "@prisma",
      "client",
      "node_modules",
      ".prisma",
    );
    copyDirectory(generatedPrismaDir, nestedPrismaDir);
    copyDirectory(generatedPrismaDir, packageLocalPrismaDir);
    embedPrismaGeneratedClient(packageDir, generatedPrismaDir);
  }
}

function detachStagedNativePackages() {
  for (const packageName of stagedNativePackagesToDetach) {
    for (const packageDir of resolveStagedPackageDirsByName(packageName)) {
      replaceDirectoryWithPhysicalCopy(packageDir);
    }
  }
}

function assertExists(targetPath, description) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Expected ${description} at ${targetPath}, but it was not found.`);
  }
}

function assertStagedServerDependencies(deployedAppDir = appDir) {
  const manifestPath = path.join(deployedAppDir, "node_modules", "@ai-novel", "server", "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const resolveFromServer = createRequire(fs.realpathSync(manifestPath));
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    let resolved;
    try {
      resolved = fs.realpathSync(resolveFromServer.resolve(dependency));
    } catch (cause) {
      throw new Error(`Staged server production dependency ${dependency} is missing. Check the injected file:server snapshot in pnpm-lock.yaml.`, { cause });
    }
    const relative = path.relative(deployedAppDir, resolved);
    if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`Staged server production dependency ${dependency} resolves outside the deployed application.`);
    }
  }
}

function main() {
  assertExists(clientSourceDir, "built client assets");

  // 默认流程：清空 build 目录 + pnpm deploy。
  // 注意：在 node（execSync）里再 spawn pnpm deploy，本机存在硬崩 0xC0000142 的坑（Windows 路径/进程树问题）。
  // 最稳做法是在 shell 单独跑 deploy，再设 AI_NOVEL_SKIP_DEPLOY=1 走本脚本做后续 staging。
  if (process.env.AI_NOVEL_SKIP_DEPLOY !== "1") {
    ensureCleanDir(buildDir);
    ensureDir(resourcesDir);
    ensureDir(path.dirname(clientTargetDir));

    try {
      runPnpm([
        "--filter",
        "@ai-novel/desktop",
        "deploy",
        "--prod",
        path.relative(repoRoot, appDir),
      ]);
    } catch (error) {
      console.warn("[stage:desktop] pnpm deploy 以非零码退出（Windows 路径 bug），已容忍并继续。");
    }
  } else {
    ensureDir(resourcesDir);
    ensureDir(path.dirname(clientTargetDir));
    console.log("[stage:desktop] 跳过 deploy（AI_NOVEL_SKIP_DEPLOY=1），复用既有 staged node_modules。");
  }

  copyDirectory(clientSourceDir, clientTargetDir);
  writeDesktopUpdaterConfig();
  syncPrismaRuntime();
  detachStagedNativePackages();
  assertStagedServerDependencies();

  // 授权/鉴权模块混淆后再进安装包（对所有 staging 路径生效，重复执行会自动跳过）。
  // 混淆完立刻生成哈希清单：清单里的哈希必须对应「混淆后的文件」，
  // 否则客户端的完整性自检会把官方包判成被篡改。
  const stagedServerDist = path.join(appDir, "node_modules", "@ai-novel", "server", "dist");
  assertExists(stagedServerDist, "bundled server dist");
  obfuscateServerDist(stagedServerDist);
  writeIntegrityManifest(stagedServerDist);

  assertExists(desktopMainEntry, "desktop main bundle");
  assertExists(serverEntry, "bundled server entry");
  assertStagedAppVersionInSync();
  assertExists(path.join(clientTargetDir, "index.html"), "bundled renderer entry");
  assertExists(appUpdateConfigPath, "desktop updater configuration");
  assertExists(path.join(stagedNodeModulesDir, ".prisma", "client", "default.js"), "bundled Prisma runtime");
  const [firstStagedPrismaClientPackage] = resolveStagedPrismaClientPackageDirs();
  assertExists(
    path.join(firstStagedPrismaClientPackage.packageDir, "node_modules", ".prisma", "client", "default.js"),
    "bundled Prisma runtime beside @prisma/client",
  );
  assertExists(
    path.join(firstStagedPrismaClientPackage.packageDir, "generated-client", "default.js"),
    "embedded generated Prisma client",
  );

  console.log(`[stage:desktop] app staged at ${appDir}`);
  console.log(`[stage:desktop] renderer resources staged at ${clientTargetDir}`);
}

/**
 * 复用 staging（AI_NOVEL_SKIP_DEPLOY=1）时，build/app 是上一次 deploy 的旧副本：
 * 既有旧版本号，也没有这次改的 desktop / server 代码。以前它只会安静地产出
 * 一个「版本号没变、内容没更新」的包，看起来像是发版成功。
 * 这里直接断言版本号一致，把它变成一次明确的失败。
 */
function assertStagedAppVersionInSync() {
  const desktopManifest = JSON.parse(fs.readFileSync(path.join(desktopDir, "package.json"), "utf8"));
  const stagedManifestPath = path.join(appDir, "package.json");
  assertExists(stagedManifestPath, "staged app manifest");
  const stagedManifest = JSON.parse(fs.readFileSync(stagedManifestPath, "utf8"));

  if (stagedManifest.version !== desktopManifest.version) {
    throw new Error(
      `build/app 里的版本是 ${stagedManifest.version}，desktop/package.json 是 ${desktopManifest.version}。`
      + "这说明当前用的是旧的 staging 副本（AI_NOVEL_SKIP_DEPLOY=1），里面的 desktop 与 server 代码也是旧的。"
      + "请去掉 AI_NOVEL_SKIP_DEPLOY 重跑 dist:desktop，让 pnpm deploy 重新 stage。",
    );
  }
}

module.exports = { assertStagedServerDependencies };

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error("[stage:desktop] failed.", error);
    process.exit(1);
  }
}
