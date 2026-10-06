import { getAuthStore, requireUser, setPrivateNoStore } from "../../../lib/auth-session.cjs";

function bodyOf(req) {
  return req.body && typeof req.body === "object" ? req.body : {};
}

export default async function handler(req, res) {
  setPrivateNoStore(res);
  const actor = requireUser(req, res, ["super_admin"]);
  if (!actor) return null;
  const store = getAuthStore();
  if (req.method === "GET") return res.status(200).json({ items: store.listPendingOperators() });
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "仅支持 GET 或 POST" });
  }
  const body = bodyOf(req);
  try {
    const user = body.action === "reject"
      ? store.rejectOperator({ operatorId: body.userId, approvedBy: actor.id })
      : store.approveOperator({ operatorId: body.userId, approvedBy: actor.id });
    return res.status(200).json({ user });
  } catch (error) {
    if (error?.message === "SUPER_ADMIN_REQUIRED") return res.status(403).json({ error: "只有超级管理员可以审批", code: "FORBIDDEN" });
    if (error?.message === "OPERATOR_NOT_PENDING") return res.status(409).json({ error: "该运营账号不在待审批状态", code: "OPERATOR_NOT_PENDING" });
    console.error("Operator approval failed", error?.message || "Error");
    return res.status(500).json({ error: "审批暂时失败" });
  }
}
