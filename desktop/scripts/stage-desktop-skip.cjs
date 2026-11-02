// Stage desktop without the crashing `pnpm deploy` step.
// The deploy already populated desktop/build/app/node_modules (502 pkgs) before
// crashing on exit (0xC0000409). This replicates the post-deploy steps of
// stage-desktop.cjs using the already-staged node_modules.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const desktopDir = path.resolve(__dirname, "..");
const buildDir = path.join(desktopDir, "build");
const appDir = path.join(buildDir, "app");
const resourcesDir = path.join(buildDir, "resources");
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

function ensureCleanDir(targetDir) { fs.rmSync(targetDir, { recursive: true, force: true }); fs.mkdirSync(targetDir, { recursive: true }); }
function ensureDir(targetDir) { fs.mkdirSync(targetDir, { recursive: true }); }
function copyDirectory(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  // Use native robocopy for recursive copies: Node fs.cpSync crashes (0xC0000409)
  // on this host during large recursive copies.
  const r = spawnSync("robocopy", [sourceDir, targetDir, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NP"], { stdio: "inherit" });
  if (r.error) throw new Error(`robocopy failed to start: ${r.error.message}`);
  if (r.status !== null && r.status >= 8) throw new Error(`robocopy failed with status ${r.status}`);
}

function replaceDirectoryWithPhysicalCopy(targetDir) {
  const tempDir = `${targetDir}.__detached__`;
  fs.rmSync(tempDir, { recursive: true, force: true });
  copyDirectory(targetDir, tempDir);
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.renameSync(tempDir, targetDir);
}
function replaceFileContents(targetPath, contents) { fs.rmSync(targetPath, { force: true }); fs.writeFileSync(targetPath, contents, "utf8"); }

function resolveWorkspacePrismaGeneratedDir() {
  const pnpmVirtualStoreDir = path.join(repoRoot, "node_modules", ".pnpm");
  assertExists(pnpmVirtualStoreDir, "workspace virtual store");
  const prismaClientStoreEntries = fs.readdirSync(pnpmVirtualStoreDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("@prisma+client@"));
  for (const entry of prismaClientStoreEntries) {
    const generatedDir = path.join(pnpmVirtualStoreDir, entry.name, "node_modules", ".prisma");
    if (fs.existsSync(path.join(generatedDir, "client", "default.js"))) return generatedDir;
  }
  throw new Error(`Expected a generated Prisma runtime directory under ${pnpmVirtualStoreDir}, but none was found.`);
}

function resolveStagedPrismaClientPackageDirs() {
  const pnpmVirtualStoreDir = path.join(stagedNodeModulesDir, ".pnpm");
  assertExists(pnpmVirtualStoreDir, "staged virtual store");
  const prismaClientStoreEntries = fs.readdirSync(pnpmVirtualStoreDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("@prisma+client@"));
  if (prismaClientStoreEntries.length === 0) throw new Error("Expected at least one staged @prisma/client package in the virtual store.");
  return prismaClientStoreEntries.map((entry) => ({
    storeEntryName: entry.name,
    packageDir: path.join(pnpmVirtualStoreDir, entry.name, "node_modules", "@prisma", "client"),
  }));
}

function resolveStagedPackageDirsByName(packageName) {
  const pnpmVirtualStoreDir = path.join(stagedNodeModulesDir, ".pnpm");
  assertExists(pnpmVirtualStoreDir, "staged virtual store");
  const matches = fs.readdirSync(pnpmVirtualStoreDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${packageName}@`))
    .map((entry) => path.join(pnpmVirtualStoreDir, entry.name, "node_modules", packageName))
    .filter((packageDir) => fs.existsSync(packageDir));
  return Array.from(new Set(matches));
}

function patchPrismaClientEntrypoint(entrypointPath, generatedEntry) {
  const entrypointSource = `module.exports = {\n  ...require('${generatedEntry}'),\n}\n`;
  replaceFileContents(entrypointPath, entrypointSource);
}

function embedPrismaGeneratedClient(prismaClientPackageDir, generatedPrismaDir) {
  const generatedPrismaClientDir = path.join(generatedPrismaDir, "client");
  const embeddedGeneratedClientDir = path.join(prismaClientPackageDir, "generated-client");
  const prismaClientPackageJsonPath = path.join(prismaClientPackageDir, "package.json");
  const prismaClientPackageJson = JSON.parse(fs.readFileSync(prismaClientPackageJsonPath, "utf8"));
  copyDirectory(generatedPrismaClientDir, embeddedGeneratedClientDir);
  if (!Array.isArray(prismaClientPackageJson.files)) prismaClientPackageJson.files = [];
  if (!prismaClientPackageJson.files.includes("generated-client")) prismaClientPackageJson.files.push("generated-client");
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
    const packageLocalPrismaDir = path.join(stagedNodeModulesDir, ".pnpm", storeEntryName, "node_modules", "@prisma", "client", "node_modules", ".prisma");
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
  if (!fs.existsSync(targetPath)) throw new Error(`Expected ${description} at ${targetPath}, but it was not found.`);
}

function main() {
  assertExists(clientSourceDir, "built client assets");
  assertExists(stagedNodeModulesDir, "staged app node_modules (from earlier pnpm deploy)");
  ensureCleanDir(buildDir === buildDir ? resourcesDir : resourcesDir);
  ensureDir(resourcesDir);
  ensureDir(path.dirname(clientTargetDir));
  copyDirectory(clientSourceDir, clientTargetDir);
  syncPrismaRuntime();
  detachStagedNativePackages();
  assertExists(desktopMainEntry, "desktop main bundle");
  assertExists(serverEntry, "bundled server entry");
  assertExists(path.join(clientTargetDir, "index.html"), "bundled renderer entry");
  assertExists(path.join(stagedNodeModulesDir, ".prisma", "client", "default.js"), "bundled Prisma runtime");
  const [firstStagedPrismaClientPackage] = resolveStagedPrismaClientPackageDirs();
  assertExists(path.join(firstStagedPrismaClientPackage.packageDir, "node_modules", ".prisma", "client", "default.js"), "bundled Prisma runtime beside @prisma/client");
  assertExists(path.join(firstStagedPrismaClientPackage.packageDir, "generated-client", "default.js"), "embedded generated Prisma client");
  console.log(`[stage-desktop-skip] app staged at ${appDir}`);
  console.log(`[stage-desktop-skip] renderer resources staged at ${clientTargetDir}`);
}

try { main(); } catch (error) { console.error("[stage-desktop-skip] failed.", error); process.exit(1); }
