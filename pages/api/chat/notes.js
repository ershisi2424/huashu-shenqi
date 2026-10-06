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
    if (req.method === "GET") return res.status(200).json(store.listOperatorNotes({ actor, brotherId, limit: req.query?.limit }));
    if (req.method === "POST") return res.status(201).json({ item: store.createOperatorNote({ actor, brotherId, body: bodyOf(req).body }) });
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "仅支持 GET 或 POST" });
  } catch (error) {
    if (error?.message === "OPERATOR_NOTE_ACCESS_DENIED") return res.status(403).json({ error: "仅运营和最高管理可以查看或记录内部备注", code: "FORBIDDEN" });
    if (error?.message === "OPERATOR_NOTE_INVALID") return res.status(400).json({ error: "内部备注不能为空", code: error.message });
    if (["CHAT_BROTHER_NOT_FOUND", "CHAT_ACCESS_DENIED"].includes(error?.message)) return res.status(403).json({ error: "无权查看该维护对象的内部备注", code: "FORBIDDEN" });
    console.error("Operator notes failed", error?.message || "Error");
    return res.status(500).json({ error: "内部备注暂时不可用" });
  }
}
