const path = require("node:path");

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

const releaseChannel = firstNonEmpty(process.env.AI_NOVEL_RELEASE_CHANNEL, "beta").toLowerCase();
const isBetaRelease = releaseChannel === "beta";
const githubOwner = firstNonEmpty(process.env.AI_NOVEL_GITHUB_OWNER, "ExplosiveCoderflome");
const githubRepo = firstNonEmpty(process.env.AI_NOVEL_GITHUB_REPO, "AI-Novel-Writing-Assistant");
const windowsSigningLink = firstNonEmpty(
  process.env.CSC_LINK,
  process.env.WIN_CSC_LINK,
  process.env.AI_NOVEL_WINDOWS_CSC_LINK,
  process.env.AI_NOVEL_WINDOWS_CSC_FILE,
);
const allowUnsignedRelease =
  firstNonEmpty(
    process.env.AI_NOVEL_ALLOW_UNSIGNED_RELEASE,
    process.env.AI_NOVEL_ALLOW_UNSIGNED_WINDOWS_RELEASE,
  ).toLowerCase() === "true";
const hasWindowsSigningMaterial = Boolean(windowsSigningLink);
const builderIconPath = path.join("builder", "app-icon.ico");

if (!isBetaRelease && !hasWindowsSigningMaterial && !allowUnsignedRelease) {
  throw new Error(
    "Public Windows desktop releases require signing material. Provide CSC_LINK/WIN_CSC_LINK, or explicitly opt in to an unsigned release.",
  );
}

module.exports = {
  appId: "com.ai-novel.desktop",
  productName: "鲸喜AI写作",
  directories: {
    app: "build/app",
    output: "build/dist",
    buildResources: "builder",
  },
  files: [
    "dist/**/*",
    "package.json",
    "node_modules/.prisma/**/*",
  ],
  extraResources: [
    {
      from: "builder/app-icon.ico",
      to: "icons/app-icon.ico",
    },
    {
      from: "build/resources/client",
      to: "client",
      filter: ["**/*"],
    },
  ],
  asar: true,
  asarUnpack: [
    "node_modules/**/*.node",
    "node_modules/@img/sharp-win32-x64/**/*",
    "node_modules/sharp/**/*",
  ],
  npmRebuild: true,
  nativeRebuilder: "sequential",
  extraMetadata: {
    main: "dist/main.js",
  },
  // 更新通道完整性优先（0.5.30 安全审查 P1）：明文 HTTP 可被中间人替换更新包。
  // app-update.yml 默认写 HTTPS 主源（keygate.de5.net，Cloudflare 前置）；运行时主进程按
  // 「HTTPS 主源 → 明文备用源」顺序选源并回填。国内 8.160.174.123 为裸 IP，无法部署有效
  // TLS 证书，在其绑定域名启用 HTTPS 之前仅作兜底源（见 desktop/src/runtime/updateFeed.ts）。
  // 发布流程：keygate.de5.net 与 8.160.174.123 各放一份 latest.yml + setup exe。
  publish: {
    provider: "generic",
    url: "https://keygate.de5.net/whale/files/",
  },
  electronUpdaterCompatibility: ">=2.16",
  generateUpdatesFilesForAllChannels: false,
  win: {
    icon: builderIconPath,
    // Keep EXE resource editing enabled for unsigned builds so Windows uses the app icon and metadata.
    signAndEditExecutable: true,
    target: [
      {
        target: "nsis",
        arch: ["x64"],
      },
      {
        target: "portable",
        arch: ["x64"],
      },
    ],
  },
  nsis: {
    artifactName: "${productName}-${version}-setup-${arch}.${ext}",
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    deleteAppDataOnUninstall: false,
    runAfterFinish: true,
    installerIcon: builderIconPath,
    uninstallerIcon: builderIconPath,
    installerHeaderIcon: builderIconPath,
  },
  portable: {
    artifactName: "${productName}-${version}-portable-${arch}.${ext}",
  },
};
