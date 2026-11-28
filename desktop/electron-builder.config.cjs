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
const isWindowsTarget = process.argv.includes("--win") || (process.platform === "win32" && !process.argv.includes("--mac") && !process.argv.includes("--linux"));

if (isWindowsTarget && !isBetaRelease && !hasWindowsSigningMaterial && !allowUnsignedRelease) {
  throw new Error(
    "Public Windows desktop releases require signing material. Provide CSC_LINK/WIN_CSC_LINK, or explicitly opt in to an unsigned release.",
  );
}

// Installer / DMG / AppImage basenames must match latest*.yml urls.
// Do not use ${productName} here: spaces become disk names that diverge from hyphenated update metadata.
// 品牌统一：对外文件名用 Jingxi-AI-Writer（ASCII、连字符，避免中文名在各下载渠道被转码）。
const artifactBasename = "Jingxi-AI-Writer";

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
    { from: "builder/app-icon.icns", to: "icons/app-icon.icns" },
    { from: "builder/app-icon.png", to: "icons/app-icon.png" },
    {
      from: "builder/app-icon.ico",
      to: "icons/app-icon.ico",
    },
    {
      from: "build/resources/client",
      to: "client",
      filter: ["**/*"],
    },
    {
      // 密室诡计样本库：进安装包兜底，热更新走 assets/locked-room/current 覆盖
      from: "builder/assets/locked-room",
      to: "assets/locked-room",
      filter: ["**/*"],
    },
  ],
  asar: true,
  asarUnpack: [
    "node_modules/**/*.node",
    "node_modules/@img/sharp-win32-x64/**/*",
    "node_modules/sharp/**/*",
  ],
  npmRebuild: false,
  beforePack: "./scripts/packaging/rebuild-native.cjs",
  afterPack: "./scripts/packaging/verify-native-runtime.cjs",
  extraMetadata: {
    main: "dist/main.js",
  },
  // 更新通道完整性优先（0.5.30 安全审查 P1）：明文 HTTP 可被中间人替换更新包。
  // app-update.yml 默认写 HTTPS 主源（keygate.de5.net，Cloudflare 前置）；运行时主进程只允许在
  // HTTPS 源之间切换并回填。国内 8.160.174.123 为裸 IP、无法部署有效 TLS 证书，已默认排除在
  // 自动更新链路之外（见 desktop/src/runtime/updateFeed.ts）。
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
  mac: {
    icon: "builder/app-icon.icns",
    identity: null,
    notarize: false,
    target: [{ target: "dmg", arch: ["x64", "arm64"] }],
    artifactName: `${artifactBasename}-\${version}-mac-\${arch}.\${ext}`,
    category: "public.app-category.productivity",
  },
  linux: {
    icon: "builder/app-icon.png",
    target: [{ target: "AppImage", arch: ["x64"] }],
    // The ELF loader follows Sharp's RPATH on disk, not inside app.asar.
    asarUnpack: ["**/node_modules/@img/sharp-libvips-linux-*/lib/**"],
    artifactName: `${artifactBasename}-\${version}-linux-\${arch}.\${ext}`,
    category: "Office",
  },
  nsis: {
    artifactName: `${artifactBasename}-\${version}-setup-\${arch}.\${ext}`,
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
    // 安装目录默认取 package name（会显示成 @ai-noveldesktop），这里用自定义脚本改成品牌名。
    include: "scripts/packaging/installer-custom.nsh",
  },
  portable: {
    artifactName: `${artifactBasename}-\${version}-portable-\${arch}.\${ext}`,
  },
};
