import { getAuthStore, requireUser } from "../../../lib/auth-session.cjs";

function bodyOf(req) {
  return req.body && typeof req.body === "object" ? req.body : {};
}

function queryValue(query, key) {
  const value = query?.[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req, res) {
  const actor = requireUser(req, res);
  if (!actor) return null;
  const store = getAuthStore();
  if (req.method === "GET") {
    try {
      const scope = queryValue(req.query, "scope") === "personal" ? "personal" : "managed";
      return res.status(200).json({ items: store.listChatBrothers({ actor, scope }) });
    } catch (error) {
      console.error("Chat brothers list failed", error?.message || "Error");
      return res.status(500).json({ error: "维护对象列表暂时不可用" });
    }
  }
  if (!["POST", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "仅支持 GET、POST 或 DELETE" });
  }
  try {
    if (req.method === "DELETE") {
      const item = store.deleteChatBrother({ actor, brotherId: bodyOf(req).brotherId });
      return res.status(200).json({ item });
    }
    const item = store.createChatBrother({ actor, clientId: bodyOf(req).clientId, nickname: bodyOf(req).nickname, note: bodyOf(req).note, profile: bodyOf(req).profile });
    return res.status(201).json({ item });
  } catch (error) {
    if (["CHAT_WRITE_DENIED", "CHAT_ACCESS_DENIED", "CHAT_BROTHER_NOT_FOUND"].includes(error?.message)) return res.status(403).json({ error: "当前账号不能修改维护对象", code: "FORBIDDEN" });
    if (error?.message === "CHAT_BROTHER_REQUIRED") return res.status(400).json({ error: "请填写维护对象昵称和本地标识", code: "CHAT_BROTHER_REQUIRED" });
    console.error("Chat brother create failed", error?.message || "Error");
    return res.status(500).json({ error: "新增维护对象暂时失败" });
  }
}
