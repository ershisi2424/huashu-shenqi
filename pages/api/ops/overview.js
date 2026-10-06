import { getAuthStore, requireUser } from "../../../lib/auth-session.cjs";

export default async function handler(req, res) {
  const actor = requireUser(req, res, ["operator", "super_admin"]);
  if (!actor) return null;
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "仅支持 GET" });
  }
  try {
    return res.status(200).json(getAuthStore().getOperatorOverview({ actor, limit: req.query?.limit }));
  } catch (error) {
    if (error?.message === "OPERATOR_VIEW_REQUIRED") return res.status(403).json({ error: "当前账号不能查看运营复盘", code: "FORBIDDEN" });
    console.error("Operator overview failed", error?.message || "Error");
    return res.status(500).json({ error: "运营复盘暂时不可用" });
  }
}
