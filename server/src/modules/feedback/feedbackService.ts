import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { resolveLocalAccountId } from "../account/accountService";
import { resolveDataRoot } from "../../runtime/appPaths";

/**
 * 客服反馈（双向留言，服务端持久化）
 * 用户发建议/反馈/意见 → 存 server/data/feedback.json → 卖家后台回复 → 用户能读到回复。
 */

const DATA_DIR = process.env.DATA_DIR || resolveDataRoot();
const FEEDBACK_FILE = path.join(DATA_DIR, "feedback.json");

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
  return { ...message };
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
