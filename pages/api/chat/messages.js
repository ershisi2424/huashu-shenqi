import { getAuthStore, requireUser } from "../../../lib/auth-session.cjs";

function bodyOf(req) {
  return req.body && typeof req.body === "object" ? req.body : {};
}

function brotherIdOf(req) {
  return String(req.query?.brotherId || bodyOf(req).brotherId || "").trim();
}

export default async function handler(req, res) {
  const actor = requireUser(req, res);
  if (!actor) return null;
  const store = getAuthStore();
  const brotherId = brotherIdOf(req);
  if (!brotherId) return res.status(400).json({ error: "缺少维护对象标识", code: "CHAT_BROTHER_REQUIRED" });
  if (req.method === "GET") {
    try {
      return res.status(200).json({ items: store.listChatMessages({ actor, brotherId, limit: req.query?.limit }) });
    } catch (error) {
      if (["CHAT_BROTHER_NOT_FOUND", "CHAT_ACCESS_DENIED"].includes(error?.message)) return res.status(403).json({ error: "无权查看这段聊天记录", code: "FORBIDDEN" });
      console.error("Chat messages list failed", error?.message || "Error");
      return res.status(500).json({ error: "聊天记录暂时不可用" });
    }
  }
  if (!["POST", "PATCH", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "仅支持 GET、POST、PATCH 或 DELETE" });
  }
  try {
    if (req.method === "DELETE") {
      const item = store.deleteChatMessage({ actor, brotherId, messageId: bodyOf(req).messageId });
      return res.status(200).json({ item });
    }
    if (req.method === "PATCH") {
      const item = store.editChatMessage({ actor, brotherId, messageId: bodyOf(req).messageId, text: bodyOf(req).text });
      return res.status(200).json({ item });
    }
    const item = store.appendChatMessage({ actor, brotherId, message: bodyOf(req).message });
    return res.status(201).json({ item });
  } catch (error) {
    if (["CHAT_BROTHER_NOT_FOUND", "CHAT_ACCESS_DENIED", "CHAT_WRITE_DENIED"].includes(error?.message)) return res.status(403).json({ error: "运营和管理账号只能只读查看聊天记录", code: "FORBIDDEN" });
    if (["CHAT_MESSAGE_INVALID", "ONLY_ANCHOR_CAN_BE_SENT"].includes(error?.message)) return res.status(400).json({ error: "聊天记录格式不正确", code: error.message });
    if (error?.message === "CHAT_MESSAGE_NOT_FOUND") return res.status(404).json({ error: "找不到要修改或删除的聊天记录", code: error.message });
    if (error?.message === "DUPLICATE_MESSAGE_ID") return res.status(409).json({ error: "这条消息已经同步过", code: error.message });
    console.error("Chat message append failed", error?.message || "Error");
    return res.status(500).json({ error: "聊天记录同步暂时失败" });
  }
}
