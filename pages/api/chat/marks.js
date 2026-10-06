import { getAuthStore, requireUser } from "../../../lib/auth-session.cjs";

function bodyOf(req) { return req.body && typeof req.body === "object" ? req.body : {}; }

export default async function handler(req, res) {
  const actor = requireUser(req, res);
  if (!actor) return null;
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ error: "仅支持 PATCH" });
  }
  const body = bodyOf(req);
  try {
    const item = getAuthStore().setChatMessageMark({ actor, brotherId: body.brotherId, messageId: body.messageId, favorite: body.favorite, pinned: body.pinned });
    return res.status(200).json({ item });
  } catch (error) {
    if (["CHAT_BROTHER_NOT_FOUND", "CHAT_ACCESS_DENIED", "CHAT_MARK_WRITE_DENIED"].includes(error?.message)) return res.status(403).json({ error: "只有主播可以修改消息收藏和置顶", code: "FORBIDDEN" });
    if (error?.message === "CHAT_MESSAGE_NOT_FOUND") return res.status(404).json({ error: "找不到这条消息", code: error.message });
    console.error("Chat message mark failed", error?.message || "Error");
    return res.status(500).json({ error: "消息标记暂时失败" });
  }
}
