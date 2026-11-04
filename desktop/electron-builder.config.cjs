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
  // 自建更新通道：桌面版从自建服务器拉取新版本（electron-updater generic provider）。
  // 安装版/win-unpacked 自动检查下载安装；便携版仍手动替换安装包。
  // 发布流程：打包后把 latest.yml + setup exe 上传到 /var/www/downloads/whale/（对应 /whale/files/）。
  publish: {
    provider: "generic",
    url: "http://8.160.174.123/whale/files/",
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
