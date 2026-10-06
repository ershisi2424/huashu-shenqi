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
  if (rejectAuthRateLimit(req, res, {
    scope: "auth.password-reset",
    envPrefix: "AUTH_PASSWORD_RESET_RATE_LIMIT",
    maxRequests: 20,
    windowMs: 15 * 60 * 1000,
  })) return;
  const body = bodyOf(req);
  try {
    const result = getAuthStore().consumePasswordReset({ token: body.token, newPassword: body.newPassword });
    return res.status(200).json(result);
  } catch (error) {
    if (error?.message === "PASSWORD_RESET_TOKEN_REQUIRED") return res.status(400).json({ error: "恢复令牌不能为空", code: "PASSWORD_RESET_TOKEN_REQUIRED" });
    if (error?.message === "INVALID_PASSWORD") return res.status(400).json({ error: "新密码至少 8 位，且不超过 128 位", code: "INVALID_PASSWORD" });
    if (error?.message === "PASSWORD_RESET_TOKEN_INVALID") return res.status(400).json({ error: "恢复令牌无效、已使用或已过期", code: "PASSWORD_RESET_TOKEN_INVALID" });
    console.error("Password reset consume failed", error?.message || "Error");
    return res.status(500).json({ error: "密码恢复暂时失败" });
  }
}
