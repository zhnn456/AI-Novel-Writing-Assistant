import { getLicenseIdentity } from "./licenseService";
import { reportClientEvent } from "./clientEvent";

/**
 * 导出溯源标记（E）。
 *
 * 写进导出文件的是一段**不可逆的设备短标识**（本机指纹前 16 位），不是授权码本身：
 *  - 用户把稿子发给别人，不会因此泄露自己的激活码；
 *  - 后台「激活设备」表里存的是完整 identifier，用前 16 位就能反查到设备与许可证，
 *    所以一份流出的破解版导出稿可以定位到是谁的机器导出的。
 *
 * txt 导出不加（会污染正文，用户拿去投稿会看到注释），只有 JSON / Markdown 加。
 */
export interface ExportProvenance {
  device: string;
  exportedAt: string;
  app: string;
}

const APP_NAME = "鲸喜AI写作";

export function buildExportProvenance(): ExportProvenance | null {
  const identity = getLicenseIdentity();
  if (!identity) return null;
  return {
    device: identity.fingerprint.slice(0, 16),
    exportedAt: new Date().toISOString(),
    app: APP_NAME,
  };
}

/** 记录一次导出（本地限流，每小时最多 3 条，不会打扰用户）。 */
export function noteExport(provenance: ExportProvenance | null, novelId: string): void {
  if (!provenance) return;
  reportClientEvent("export", `导出小说 ${novelId}，设备 ${provenance.device}`);
}
