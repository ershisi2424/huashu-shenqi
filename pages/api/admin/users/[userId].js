import { getAuthStore, requireUser } from "../../../../lib/auth-session.cjs";

function bodyOf(req) {
  return req.body && typeof req.body === "object" ? req.body : {};
}

function queryValue(query, key) {
  const value = query?.[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req, res) {
  const actor = requireUser(req, res, ["super_admin"]);
  if (!actor) return null;
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "仅支持 DELETE" });
  }
  try {
    const result = getAuthStore().confirmUserDeletion({
      actor,
      targetUserId: queryValue(req.query, "userId"),
      token: bodyOf(req).confirmationToken || bodyOf(req).token,
    });
    return res.status(200).json(result);
  } catch (error) {
    if (error?.message === "USER_NOT_FOUND") return res.status(404).json({ error: "用户不存在", code: "NOT_FOUND" });
    if (error?.message === "USER_DELETE_CONFIRMATION_INVALID") return res.status(409).json({ error: "删除确认已失效，请重新点击删除", code: "CONFIRMATION_INVALID" });
    if (error?.message === "USER_DELETE_HAS_DEPENDENTS") return res.status(409).json({ error: "该运营仍有下属主播，请先处理下属账号", code: "HAS_DEPENDENTS" });
    if (error?.message === "USER_DELETE_FORBIDDEN") return res.status(403).json({ error: "不能删除当前登录的超级管理员", code: "FORBIDDEN" });
    console.error("User delete failed", error?.message || "Error");
    return res.status(500).json({ error: "用户删除暂时失败" });
  }
}
