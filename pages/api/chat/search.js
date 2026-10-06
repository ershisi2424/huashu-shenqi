import { getAuthStore, requireUser } from "../../../lib/auth-session.cjs";

export default async function handler(req, res) {
  const actor = requireUser(req, res);
  if (!actor) return null;
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "仅支持 GET" });
  }
  const store = getAuthStore();
  try {
    const scope = req.query?.scope === "personal" ? "personal" : "managed";
    return res.status(200).json({ ...store.searchChat({ actor, query: req.query?.q || req.query?.query, brotherId: req.query?.brotherId, limit: req.query?.limit, scope }) });
  } catch (error) {
    if (["CHAT_ACCESS_DENIED", "ACTIVE_USER_REQUIRED"].includes(error?.message)) return res.status(403).json({ error: "无权搜索这些聊天记录", code: "FORBIDDEN" });
    console.error("Chat search failed", error?.message || "Error");
    return res.status(500).json({ error: "聊天搜索暂时失败" });
  }
}
