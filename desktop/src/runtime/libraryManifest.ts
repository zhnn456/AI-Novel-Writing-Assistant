import crypto from "node:crypto";
import os from "node:os";

import { compareVersions, UPDATE_FEED_SOURCES, type UpdateFeedSource } from "./updateFeed";

/**
 * 密室诡计样本库 · 清单校验（纯函数，不依赖 Electron）
 *
 * 与 Keygate `internal/handler/internal_sign.go` 的签名格式严格一致：
 *   message = "v2\n{appVersion}\n{buildId}\n{aggregate}"
 * 这样样本库清单和 exe 清单用同一把 Ed25519 公钥，不再引入第二套密钥。
 */

export const KEYGATE_PUBLIC_KEY_HEX =
  "5c345f515036ee78a1e4efe749edee4705a277acafe5e488c48bf042954e787b";

export const MANIFEST_SIGN_PREFIX = "v2";
export const LIBRARY_ID = "locked-room";

export interface LibraryManifestFile {
  path: string;
  sha256: string;
  size: number;
}

export interface LibraryManifestSignature {
  alg: string;
  kid: string;
  sig: string;
  appVersion: string;
  buildId: string;
}

export interface LibraryManifest {
  library: string;
  version: string;
  aggregate: string;
  fileCount: number;
  bytes: number;
  files: LibraryManifestFile[];
  entry: string;
  minAppVersion: string;
  rollout: number;
  killSwitch: boolean;
  signature: LibraryManifestSignature | null;
}

export function libraryFeedSources(currentSources: UpdateFeedSource[] = UPDATE_FEED_SOURCES): UpdateFeedSource[] {
  const override = process.env.AI_NOVEL_LOCKED_ROOM_FEED?.trim();
  if (override) {
    return [{ id: "hk", label: "自定样本库源", url: override.replace(/\/?$/, "/") }];
  }
  return currentSources.map((source) => ({
    ...source,
    url: source.url.replace(/files\/$/, "hot/locked-room/"),
  }));
}

export function signedLibraryMessage(digest: string, appVersion: string, buildId: string): Buffer {
  return Buffer.from(`${MANIFEST_SIGN_PREFIX}\n${appVersion}\n${buildId}\n${digest}`, "utf8");
}

/**
 * 真正送签的摘要：不只签文件集合（aggregate），还签版本号、最低 App 版本、
 * 灰度与熔断开关，避免中间人只改版本号做降级、或把 rollout 改成 100。
 */
export function librarySigningDigest(manifest: {
  library: string;
  version: string;
  aggregate: string;
  minAppVersion: string;
  rollout: number;
  killSwitch: boolean;
}): string {
  const payload = JSON.stringify([
    manifest.library,
    manifest.version,
    manifest.aggregate,
    manifest.minAppVersion,
    Number(manifest.rollout),
    Boolean(manifest.killSwitch),
  ]);
  return crypto.createHash("sha256").update(Buffer.from(payload, "utf8")).digest("hex");
}

export function verifyLibraryManifest(
  manifest: LibraryManifest,
  publicKeyHex: string = KEYGATE_PUBLIC_KEY_HEX,
): boolean {
  const signature = manifest?.signature;
  if (!signature?.sig || !signature.appVersion || !signature.buildId) return false;
  if (signature.alg !== "ed25519") return false;
  if (!/^[0-9a-f]{64}$/.test(manifest.aggregate ?? "")) return false;
  try {
    const spki = Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      Buffer.from(publicKeyHex, "hex"),
    ]);
    const key = crypto.createPublicKey({ key: spki, format: "der", type: "spki" });
    const message = signedLibraryMessage(
      librarySigningDigest(manifest),
      signature.appVersion,
      signature.buildId,
    );
    return crypto.verify(null, message, key, Buffer.from(signature.sig, "base64url"));
  } catch {
    return false;
  }
}

/** 灰度分桶：按机器维度稳定，不随重启变化。 */
export function installBucket(seed: string = `${os.hostname()}|${process.env.USERNAME ?? ""}`): number {
  const digest = crypto.createHash("sha256").update(seed).digest("hex");
  return Number.parseInt(digest.slice(0, 8), 16) % 100;
}

export function shouldApplyManifest(
  manifest: LibraryManifest,
  options: { localVersion: string | null; appVersion: string; bucket: number },
): { ok: boolean; reason: string } {
  if (manifest.library !== LIBRARY_ID) return { ok: false, reason: "清单不是密室诡计样本库" };
  if (manifest.killSwitch) return { ok: false, reason: "远程已开启 killSwitch" };
  if (manifest.minAppVersion && compareVersions(options.appVersion, manifest.minAppVersion) < 0) {
    return { ok: false, reason: `需要 App ${manifest.minAppVersion}，当前 ${options.appVersion}` };
  }
  const rollout = Number.isFinite(manifest.rollout) ? Math.min(100, Math.max(0, manifest.rollout)) : 100;
  if (options.bucket >= rollout) {
    return { ok: false, reason: `灰度未命中（bucket ${options.bucket} / rollout ${rollout}）` };
  }
  if (options.localVersion && compareVersions(manifest.version, options.localVersion) <= 0) {
    return { ok: false, reason: `本地已是 ${options.localVersion}` };
  }
  return { ok: true, reason: `可升级到 ${manifest.version}` };
}
