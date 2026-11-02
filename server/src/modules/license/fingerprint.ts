import crypto from "node:crypto";
import os from "node:os";
import { execSync } from "node:child_process";

let cachedFingerprint: string | null = null;

function readWindowsMachineGuid(): string | null {
  if (process.platform !== "win32") {
    return null;
  }
  const fromEnv = process.env.AI_NOVEL_MACHINE_ID?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  try {
    const output = execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
      { encoding: "utf8", windowsHide: true, timeout: 3000 },
    );
    const match = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.exec(output);
    return match ? match[0] : null;
  } catch {
    return null;
  }
}

/**
 * 生成绑定到当前机器的稳定指纹。同一台机器重启后结果一致，
 * 授权文件复制到另一台机器时指纹不匹配，从而实现"一台授权一台用"。
 */
export function computeMachineFingerprint(): string {
  if (cachedFingerprint) {
    return cachedFingerprint;
  }
  const parts = [
    os.hostname(),
    os.platform(),
    os.release(),
    os.arch(),
    os.cpus()[0]?.model ?? "cpu",
    String(os.totalmem()),
  ];
  const machineGuid = readWindowsMachineGuid();
  if (machineGuid) {
    parts.push(machineGuid);
  }
  cachedFingerprint = crypto.createHash("sha256").update(parts.join("|")).digest("hex");
  return cachedFingerprint;
}
