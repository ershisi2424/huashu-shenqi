import { getAuthStore, requireUser, setPrivateNoStore } from "../../../lib/auth-session.cjs";

function bodyOf(req) {
  return req.body && typeof req.body === "object" ? req.body : {};
}

function queryValue(query, key) {
  const value = query?.[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req, res) {
  setPrivateNoStore(res);
  const actor = requireUser(req, res);
  if (!actor) return null;
  const store = getAuthStore();
  if (req.method === "GET") {
    try {
      const anchorId = queryValue(req.query, "anchorId");
      if (anchorId) return res.status(200).json(store.listReadonlyWorkspace({ actor, anchorId }));
      const brotherId = queryValue(req.query, "brotherId");
      if (!brotherId) return res.status(400).json({ error: "缺少主播或维护对象标识", code: "WORKSPACE_TARGET_REQUIRED" });
      return res.status(200).json({ items: store.listWorkspaceSnapshots({ actor, brotherId, limit: queryValue(req.query, "limit") }) });
    } catch (error) {
      if (["WORKSPACE_READ_DENIED", "CHAT_ACCESS_DENIED", "CHAT_BROTHER_NOT_FOUND"].includes(error?.message)) return res.status(403).json({ error: "无权查看该主播工作台", code: "FORBIDDEN" });
      if (error?.message === "ANCHOR_NOT_FOUND") return res.status(404).json({ error: "主播不存在", code: "NOT_FOUND" });
      console.error("Workspace snapshot list failed", error?.message || "Error");
      return res.status(500).json({ error: "主播工作台暂时不可用" });
    }
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "仅支持 GET 或 POST" });
  }
  try {
    const body = bodyOf(req);
    const item = store.saveWorkspaceSnapshot({ actor, brotherId: body.brotherId, snapshot: body.snapshot });
    return res.status(201).json({ item });
  } catch (error) {
    if (["WORKSPACE_WRITE_DENIED", "CHAT_ACCESS_DENIED", "CHAT_BROTHER_NOT_FOUND"].includes(error?.message)) return res.status(403).json({ error: "只有主播本人可以保存工作台内容", code: "FORBIDDEN" });
    if (["CHAT_SOURCE_MESSAGE_REQUIRED", "CHAT_SOURCE_MESSAGE_NOT_FOUND"].includes(error?.message)) return res.status(409).json({ error: "工作台候选必须绑定当前维护对象下已确认的大哥消息", code: "CHAT_SOURCE_MESSAGE_INVALID" });
    console.error("Workspace snapshot save failed", error?.message || "Error");
    return res.status(500).json({ error: "工作台保存暂时失败" });
  }
}
