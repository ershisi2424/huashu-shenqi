import { getAuthStore, rejectAuthRateLimit, setPrivateNoStore } from "../../../lib/auth-session.cjs";

function bodyOf(req) {
  return req.body && typeof req.body === "object" ? req.body : {};
}

export default async function handler(req, res) {
  setPrivateNoStore(res);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "仅支持 POST" });
  }
  const body = bodyOf(req);
  if (rejectAuthRateLimit(req, res, { scope: "auth.register", phone: body.phone, envPrefix: "AUTH_REGISTER_RATE_LIMIT", maxRequests: 5, windowMs: 60 * 60 * 1000 })) return;
  try {
    const store = getAuthStore();
    if (body.role === "anchor") {
      const user = store.registerAnchorApplication({ operatorId: body.operatorId, phone: body.phone, name: body.name, password: body.password });
      return res.status(201).json({ user, message: "主播申请已提交，等待所选运营审批" });
    }
    if (body.role && body.role !== "operator") return res.status(400).json({ error: "不支持的注册角色", code: "INVALID_REGISTER_ROLE" });
    const user = store.registerOperator({ phone: body.phone, name: body.name, password: body.password });
    return res.status(201).json({ user, message: "运营注册已提交，等待超级管理员审批" });
  } catch (error) {
    if (error?.message === "PHONE_ALREADY_REGISTERED") return res.status(409).json({ error: "手机号已注册", code: "PHONE_ALREADY_REGISTERED" });
    if (error?.message === "OPERATOR_NOT_AVAILABLE") return res.status(400).json({ error: "所选运营暂不可申请，请重新选择", code: "OPERATOR_NOT_AVAILABLE" });
    if (["INVALID_PHONE", "INVALID_PASSWORD", "NAME_REQUIRED"].includes(error?.message)) return res.status(400).json({ error: "请检查手机号、姓名和密码（密码至少 8 位）", code: error.message });
    console.error("Account registration failed", error?.message || "Error");
    return res.status(500).json({ error: "注册暂时失败" });
  }
}
