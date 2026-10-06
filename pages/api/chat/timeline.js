import { getAuthStore, requireUser } from "../../../lib/auth-session.cjs";

function bodyOf(req) { return req.body && typeof req.body === "object" ? req.body : {}; }
function brotherIdOf(req) { return String(req.query?.brotherId || bodyOf(req).brotherId || "").trim(); }

export default async function handler(req, res) {
  const actor = requireUser(req, res);
  if (!actor) return null;
  const brotherId = brotherIdOf(req);
  if (!brotherId) return res.status(400).json({ error: "缺少维护对象标识", code: "CHAT_BROTHER_REQUIRED" });
  const store = getAuthStore();
  try {
    if (req.method === "GET") return res.status(200).json(store.listRelationshipEvents({ actor, brotherId, limit: req.query?.limit }));
    if (req.method === "POST") return res.status(201).json({ item: store.createRelationshipEvent({ actor, brotherId, type: bodyOf(req).type, title: bodyOf(req).title, body: bodyOf(req).body, occurredAt: bodyOf(req).occurredAt }) });
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "仅支持 GET 或 POST" });
  } catch (error) {
    if (["CHAT_BROTHER_NOT_FOUND", "CHAT_ACCESS_DENIED"].includes(error?.message)) return res.status(403).json({ error: "无权查看这段关系记录", code: "FORBIDDEN" });
    if (error?.message === "TIMELINE_WRITE_DENIED") return res.status(403).json({ error: "运营和管理账号只能只读查看关系时间线", code: "FORBIDDEN" });
    if (error?.message === "TIMELINE_EVENT_INVALID") return res.status(400).json({ error: "请填写有效的时间线事件", code: error.message });
    console.error("Relationship timeline failed", error?.message || "Error");
    return res.status(500).json({ error: "关系时间线暂时不可用" });
  }
}
