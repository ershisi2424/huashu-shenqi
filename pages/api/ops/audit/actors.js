import { getAuthStore, requireUser } from "../../../../lib/auth-session.cjs";

function queryValue(query, key) {
  const value = query?.[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req, res) {
  const actor = requireUser(req, res, ["operator", "super_admin"]);
  if (!actor) return null;
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "仅支持 GET" });
  }
  try {
    return res.status(200).json(getAuthStore().listAuditActors({
      actor,
      role: queryValue(req.query, "role"),
      query: queryValue(req.query, "query"),
    }));
  } catch (error) {
    if (error?.message === "AUDIT_QUERY_INVALID") return res.status(400).json({ error: "审计查询条件无效", code: "INVALID_QUERY" });
    if (error?.message === "AUDIT_ACCESS_DENIED") return res.status(403).json({ error: "当前账号不能查看操作审计", code: "FORBIDDEN" });
    console.error("Audit actors query failed", error?.message || "Error");
    return res.status(500).json({ error: "操作人分组暂时不可用" });
  }
}
