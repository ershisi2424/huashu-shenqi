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
  const body = bodyOf(req);
  const brotherId = String(queryValue(req.query, "brotherId") || body.brotherId || "").trim();
  if (!brotherId) return res.status(400).json({ error: "缺少维护对象标识", code: "CHAT_BROTHER_REQUIRED" });
  try {
    if (req.method === "GET") {
      return res.status(200).json(store.listReplyHistory({ actor, brotherId, limit: queryValue(req.query, "limit") }));
    }
    if (req.method === "POST") {
      const item = store.saveReplyHistory({
        actor,
        brotherId,
        sourceMessageId: body.sourceMessageId,
        currentMessage: body.currentMessage,
        replyStyle: body.replyStyle,
        replies: body.replies,
        profile: body.profile,
        coreDecision: body.coreDecision,
        algorithmCore: body.algorithmCore,
        runtimeAnalysis: body.runtimeAnalysis,
        runtimeIntake: body.runtimeIntake,
        runtime: body.runtime,
        openingTopics: body.openingTopics,
        liveInvite: body.liveInvite,
      });
      return res.status(201).json({ item });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "仅支持 GET 或 POST" });
  } catch (error) {
    if (["CHAT_BROTHER_NOT_FOUND", "CHAT_ACCESS_DENIED", "REPLY_HISTORY_WRITE_DENIED"].includes(error?.message)) return res.status(403).json({ error: "无权访问这段回复历史", code: "FORBIDDEN" });
    if (["CHAT_SOURCE_MESSAGE_REQUIRED", "CHAT_SOURCE_MESSAGE_NOT_FOUND"].includes(error?.message)) return res.status(409).json({ error: "回复历史必须绑定当前维护对象下已确认的大哥消息", code: "CHAT_SOURCE_MESSAGE_INVALID" });
    if (error?.message === "REPLY_HISTORY_INVALID") return res.status(400).json({ error: "至少需要保存一条有效回复", code: error.message });
    console.error("Reply history request failed", error?.message || "Error");
    return res.status(500).json({ error: "回复历史暂时不可用" });
  }
}
