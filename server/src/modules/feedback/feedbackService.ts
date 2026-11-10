import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { resolveLocalAccountId } from "../account/accountService";
import { resolveDataRoot } from "../../runtime/appPaths";
import { computeMachineFingerprint } from "../license/fingerprint";

/**
 * 客服反馈（双向留言，服务端持久化）
 * 用户发建议/反馈/意见 → 本地存一份 + 同步上报 Keygate 中央服务器 → 管理员在 Keygate 后台查看。
 */

const DATA_DIR = process.env.DATA_DIR || resolveDataRoot();
const FEEDBACK_FILE = path.join(DATA_DIR, "feedback.json");

/** Keygate 中央反馈上报地址（与 licenseService 共用同一个授权服务器）。 */
const KEYGATE_BASE_URL = process.env.KEYGATE_BASE_URL || "https://keygate.de5.net";

export interface FeedbackMessage {
  id: string;
  accountId: string;
  type: "suggestion" | "bug" | "feedback";
  content: string;
  contact: string;
  status: "open" | "replied";
  reply: string;
  createdAt: string;
  repliedAt: string | null;
}

interface FeedbackStore {
  messages: FeedbackMessage[];
}

function readStore(): FeedbackStore {
  try {
    if (fs.existsSync(FEEDBACK_FILE)) {
      return JSON.parse(fs.readFileSync(FEEDBACK_FILE, "utf8")) as FeedbackStore;
    }
  } catch (error) {
    console.error("[feedback] 读取留言数据失败：", (error as Error).message);
  }
  return { messages: [] };
}

function writeStore(store: FeedbackStore): void {
  fs.mkdirSync(path.dirname(FEEDBACK_FILE), { recursive: true });
  const tmp = `${FEEDBACK_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(tmp, FEEDBACK_FILE);
}

export function addFeedback(
  input: { type: "suggestion" | "bug" | "feedback"; content: string; contact?: string },
): FeedbackMessage {
  const accountId = resolveLocalAccountId();
  const content = input.content.trim();
  if (!content) throw new Error("请填写留言内容。");
  if (content.length > 5000) throw new Error("留言内容过长。");
  const store = readStore();
  const message: FeedbackMessage = {
    id: Date.now().toString(36) + crypto.randomBytes(4).toString("hex"),
    accountId,
    type: input.type,
    content,
    contact: (input.contact || "").trim(),
    status: "open",
    reply: "",
    createdAt: new Date().toISOString(),
    repliedAt: null,
  };
  store.messages.push(message);
  writeStore(store);

  // 同步上报到 Keygate 中央服务器（fire-and-forget，失败不影响用户体验）
  void uploadToKeygate(message);

  return { ...message };
}

/** 把留言转发到 Keygate，让管理员在后台能看到。 */
async function uploadToKeygate(message: FeedbackMessage): Promise<void> {
  try {
    await fetch(`${KEYGATE_BASE_URL}/api/v1/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "",
        contact: message.contact,
        type: message.type,
        content: message.content,
        device_fingerprint: computeMachineFingerprint(),
        app_version: process.env.npm_package_version || "",
        os: process.platform,
      }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    console.warn("[feedback] 上报 Keygate 失败（不影响本地保存）：", (error as Error).message);
  }
}

export function listByAccount(): FeedbackMessage[] {
  const accountId = resolveLocalAccountId();
  return readStore()
    .messages.filter((m) => m.accountId === accountId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function listAll(): FeedbackMessage[] {
  return [...readStore().messages].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function replyTo(id: string, reply: string): FeedbackMessage {
  const store = readStore();
  const message = store.messages.find((m) => m.id === id);
  if (!message) throw new Error("留言不存在。");
  message.reply = (reply || "").trim();
  message.status = "replied";
  message.repliedAt = new Date().toISOString();
  writeStore(store);
  return { ...message };
}

interface KeygateReply {
  id: string;
  content: string;
  reply: string;
  replied_at: string | null;
  status: string;
}

/**
 * 从 Keygate 拉取本设备的新回复，匹配到本地留言并更新。
 * 返回本次新收到的回复数量（用于红点提醒）。
 */
export async function syncRemoteReplies(): Promise<{ newReplies: number; messages: FeedbackMessage[] }> {
  const deviceFp = computeMachineFingerprint();
  let remoteReplies: KeygateReply[] = [];
  try {
    const resp = await fetch(
      `${KEYGATE_BASE_URL}/api/v1/feedback/check?device_fingerprint=${encodeURIComponent(deviceFp)}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!resp.ok) return { newReplies: 0, messages: listByAccount() };
    const body = (await resp.json()) as { success?: boolean; data?: { replies?: KeygateReply[] } };
    remoteReplies = body.data?.replies || [];
  } catch {
    return { newReplies: 0, messages: listByAccount() };
  }
  if (remoteReplies.length === 0) return { newReplies: 0, messages: listByAccount() };

  // 按 content 匹配本地留言，把回复同步进来
  const store = readStore();
  let newCount = 0;
  for (const remote of remoteReplies) {
    if (!remote.reply) continue;
    const local = store.messages.find(
      (m) => m.content === remote.content && m.status !== "replied",
    );
    if (local) {
      local.reply = remote.reply;
      local.status = "replied";
      local.repliedAt = remote.replied_at;
      newCount++;
    }
  }
  if (newCount > 0) writeStore(store);
  return { newReplies: newCount, messages: listByAccount() };
}
