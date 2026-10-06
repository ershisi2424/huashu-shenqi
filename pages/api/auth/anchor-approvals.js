import { getAuthStore, requireUser, setPrivateNoStore } from "../../../lib/auth-session.cjs";

function bodyOf(req) {
  return req.body && typeof req.body === "object" ? req.body : {};
}

export default async function handler(req, res) {
  setPrivateNoStore(res);
  const approver = requireUser(req, res, ["operator", "super_admin"]);
  if (!approver) return null;
  const store = getAuthStore();
  if (req.method === "GET") {
    try {
      return res.status(200).json({ items: store.listPendingAnchorsForApprover(approver.id) });
    } catch (error) {
      console.error("Pending anchor list failed", error?.message || "Error");
      return res.status(500).json({ error: "主播申请列表暂时不可用" });
    }
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "仅支持 GET 或 POST" });
  }
  const body = bodyOf(req);
  try {
    const user = body.action === "reject"
      ? store.rejectAnchor({ anchorId: body.userId, approvedBy: approver.id })
      : store.approveAnchor({ anchorId: body.userId, approvedBy: approver.id });
    return res.status(200).json({ user });
  } catch (error) {
    if (error?.message === "ANCHOR_APPROVAL_FORBIDDEN") return res.status(403).json({ error: "运营只能审批自己名下主播，超级管理员可以审批全部主播", code: "FORBIDDEN" });
    if (error?.message === "ANCHOR_NOT_PENDING") return res.status(409).json({ error: "该主播申请不在待审批状态", code: "ANCHOR_NOT_PENDING" });
    console.error("Anchor approval failed", error?.message || "Error");
    return res.status(500).json({ error: "主播审批暂时失败" });
  }
}
