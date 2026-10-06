import { getAuthStore, requireUser } from "../../../lib/auth-session.cjs";

export default async function handler(req, res) {
  const actor = requireUser(req, res, ["super_admin"]);
  if (!actor) return null;
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "仅支持 GET" });
  }
  try {
    return res.status(200).json(getAuthStore().listUserUsage({ actor }));
  } catch (error) {
    if (error?.message === "SUPER_ADMIN_REQUIRED") return res.status(403).json({ error: "只有超级管理员可以查看用户使用管理", code: "FORBIDDEN" });
    console.error("User usage list failed", error?.message || "Error");
    return res.status(500).json({ error: "用户使用管理暂时不可用" });
  }
}
