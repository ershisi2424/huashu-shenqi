import { getAuthStore, requireUser, setPrivateNoStore } from "../../../../../lib/auth-session.cjs";

function bodyOf(req) {
  return req.body && typeof req.body === "object" ? req.body : {};
}

function queryValue(query, key) {
  const value = query?.[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req, res) {
  setPrivateNoStore(res);
  const actor = requireUser(req, res, ["super_admin"]);
  if (!actor) return null;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "仅支持 POST" });
  }
  try {
    const result = getAuthStore().preparePasswordReset({
      actor,
      targetUserId: queryValue(req.query, "userId"),
      ttlMs: bodyOf(req).ttlMs,
    });
    // The token is returned once to the authenticated administrator. It is
    // never persisted or emitted in logs; the admin is responsible for
    // delivering it through the team's approved private channel.
    return res.status(200).json(result);
  } catch (error) {
    if (error?.message === "USER_NOT_FOUND") return res.status(404).json({ error: "用户不存在", code: "NOT_FOUND" });
    if (error?.message === "PASSWORD_RESET_TARGET_FORBIDDEN") return res.status(403).json({ error: "不能为超级管理员或当前账号发起密码恢复", code: "FORBIDDEN" });
    if (error?.message === "SUPER_ADMIN_REQUIRED") return res.status(403).json({ error: "只有超级管理员可以发起密码恢复", code: "FORBIDDEN" });
    console.error("Password reset issue failed", error?.message || "Error");
    return res.status(500).json({ error: "密码恢复暂时不可用" });
  }
}
