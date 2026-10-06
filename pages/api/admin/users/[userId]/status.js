import { getAuthStore, requireUser } from "../../../../../lib/auth-session.cjs";

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
  if (req.method !== "POST" && req.method !== "PATCH") {
    res.setHeader("Allow", "POST, PATCH");
    return res.status(405).json({ error: "仅支持 POST 或 PATCH" });
  }
  try {
    const user = getAuthStore().changeUserStatus({ actor, targetUserId: queryValue(req.query, "userId"), status: bodyOf(req).status });
    return res.status(200).json({ user });
  } catch (error) {
    if (error?.message === "USER_NOT_FOUND") return res.status(404).json({ error: "用户不存在", code: "NOT_FOUND" });
    if (["USER_STATUS_FORBIDDEN", "SUPER_ADMIN_REQUIRED"].includes(error?.message)) return res.status(403).json({ error: "不能修改该用户状态", code: "FORBIDDEN" });
    if (error?.message === "USER_STATUS_INVALID") return res.status(400).json({ error: "用户状态无效", code: "INVALID_STATUS" });
    console.error("User status change failed", error?.message || "Error");
    return res.status(500).json({ error: "用户状态更新暂时失败" });
  }
}
