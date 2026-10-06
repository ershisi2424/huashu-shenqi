import { getAuthStore, requireUser } from "../../../lib/auth-session.cjs";

export default async function handler(req, res) {
  const actor = requireUser(req, res, ["super_admin"]);
  if (!actor) return null;
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "仅支持 GET" });
  }
  try {
    return res.status(200).json(getAuthStore().getToolUsage({ actor, limit: req.query?.limit, from: req.query?.from, to: req.query?.to }));
  } catch (error) {
    if (error?.message === "SUPER_ADMIN_REQUIRED") return res.status(403).json({ error: "只有超级管理员可以查看工具使用情况", code: "FORBIDDEN" });
    if (error?.message === "USAGE_QUERY_INVALID") return res.status(400).json({ error: "工具使用查询条件无效", code: "USAGE_QUERY_INVALID" });
    console.error("Admin usage query failed", error?.message || "Error");
    return res.status(500).json({ error: "工具使用情况暂时不可用" });
  }
}
