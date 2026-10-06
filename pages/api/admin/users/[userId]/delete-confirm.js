import { getAuthStore, requireUser } from "../../../../../lib/auth-session.cjs";

function queryValue(query, key) {
  const value = query?.[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req, res) {
  const actor = requireUser(req, res, ["super_admin"]);
  if (!actor) return null;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "仅支持 POST" });
  }
  try {
    const confirmation = getAuthStore().prepareUserDeletion({ actor, targetUserId: queryValue(req.query, "userId") });
    return res.status(200).json(confirmation);
  } catch (error) {
    if (error?.message === "USER_NOT_FOUND") return res.status(404).json({ error: "用户不存在", code: "NOT_FOUND" });
    if (error?.message === "USER_DELETE_FORBIDDEN") return res.status(403).json({ error: "不能删除当前登录的超级管理员", code: "FORBIDDEN" });
    if (error?.message === "SUPER_ADMIN_REQUIRED") return res.status(403).json({ error: "只有超级管理员可以删除用户", code: "FORBIDDEN" });
    console.error("User delete confirmation failed", error?.message || "Error");
    return res.status(500).json({ error: "删除确认暂时不可用" });
  }
}
