import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { computeMachineFingerprint } from "../license/fingerprint";
import { resolveDataRoot } from "../../runtime/appPaths";

/**
 * 个人中心账号（服务端持久化）
 * 头像/昵称/邮箱/密码存在本机服务器的数据目录里（server/data/accounts.json）。
 * 与授权服务器分工：这里管“个人资料”，授权管“码”。
 */

const DATA_DIR = process.env.DATA_DIR || resolveDataRoot();
const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");

export interface AccountProfile {
  accountId: string;
  nickname: string;
  email: string;
  /** base64 data URL（小图），没有则为空字符串。 */
  avatar: string;
  hasPassword: boolean;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  updatedAt: string;
}

/** 对外暴露的安全形态：绝不把密码哈希/盐返回给接口调用方。 */
export type PublicAccountProfile = Omit<AccountProfile, "passwordHash" | "passwordSalt">;

function toPublic(account: AccountProfile): PublicAccountProfile {
  return {
    accountId: account.accountId,
    nickname: account.nickname,
    email: account.email,
    avatar: account.avatar,
    hasPassword: account.hasPassword,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

interface AccountStore {
  accounts: AccountProfile[];
}

function readStore(): AccountStore {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8")) as AccountStore;
    }
  } catch (error) {
    console.error("[account] 读取账号数据失败：", (error as Error).message);
  }
  return { accounts: [] };
}

function writeStore(store: AccountStore): void {
  fs.mkdirSync(path.dirname(ACCOUNTS_FILE), { recursive: true });
  const tmp = `${ACCOUNTS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(tmp, ACCOUNTS_FILE);
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 32).toString("hex");
}

function defaultProfile(accountId: string): AccountProfile {
  const now = new Date().toISOString();
  return {
    accountId,
    nickname: "",
    email: "",
    avatar: "",
    hasPassword: false,
    passwordHash: "",
    passwordSalt: "",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 解析"本机账号"标识。
 *
 * 越权漏洞修复：账号读写一律锁定到本机（由机器指纹派生），
 * 不再信任客户端传入的任意 accountId —— 杜绝 A 用 B 的 accountId
 * 读写 B 资料。单机桌面软件天然就是"一台机器一个账号"。
 */
function resolveLocalAccountId(): string {
  return computeMachineFingerprint().slice(0, 12);
}
// 供其他模块（如客服反馈）复用同一"本机账号"标识。
export { resolveLocalAccountId };

export function getAccount(): PublicAccountProfile {
  const accountId = resolveLocalAccountId();
  const store = readStore();
  let account = store.accounts.find((a) => a.accountId === accountId);
  if (!account) {
    account = defaultProfile(accountId);
    store.accounts.push(account);
    writeStore(store);
  }
  return toPublic(account);
}

export function updateProfile(
  input: { nickname?: string; email?: string; avatar?: string },
): PublicAccountProfile {
  const accountId = resolveLocalAccountId();
  const store = readStore();
  let account = store.accounts.find((a) => a.accountId === accountId);
  if (!account) {
    account = defaultProfile(accountId);
    store.accounts.push(account);
  }
  if (typeof input.nickname === "string") {
    const nickname = input.nickname.trim();
    if (nickname.length > 30) throw new Error("昵称最多 30 个字符。");
    account.nickname = nickname;
  }
  if (typeof input.email === "string") {
    account.email = input.email.trim();
  }
  if (typeof input.avatar === "string") {
    if (input.avatar.length > 2_000_000) throw new Error("头像图片过大，请换一张小图。");
    account.avatar = input.avatar;
  }
  account.updatedAt = new Date().toISOString();
  writeStore(store);
  return toPublic(account);
}

/** 设置/修改密码。已有密码时必须提供旧密码。 */
export function changePassword(
  input: { currentPassword?: string; newPassword: string },
): PublicAccountProfile {
  const accountId = resolveLocalAccountId();
  const newPassword = input.newPassword;
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    throw new Error("新密码至少 6 位。");
  }
  const store = readStore();
  let account = store.accounts.find((a) => a.accountId === accountId);
  if (!account) {
    account = defaultProfile(accountId);
    store.accounts.push(account);
  }
  if (account.hasPassword) {
    const current = typeof input.currentPassword === "string" ? input.currentPassword : "";
    if (hashPassword(current, account.passwordSalt) !== account.passwordHash) {
      throw new Error("当前密码不正确。");
    }
  }
  account.passwordSalt = crypto.randomBytes(16).toString("hex");
  account.passwordHash = hashPassword(newPassword, account.passwordSalt);
  account.hasPassword = true;
  account.updatedAt = new Date().toISOString();
  writeStore(store);
  return toPublic(account);
}
