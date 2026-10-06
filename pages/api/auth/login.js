import { getAuthStore, rejectAuthRateLimit, setPrivateNoStore, setSessionCookie } from "../../../lib/auth-session.cjs";

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
  if (rejectAuthRateLimit(req, res, { scope: "auth.login", phone: body.phone, envPrefix: "AUTH_LOGIN_RATE_LIMIT", maxRequests: 10, windowMs: 15 * 60 * 1000 })) return;
  const store = getAuthStore();
  const state = store.getAccountState(body.phone);
  if (state.status === "pending") return res.status(403).json({ error: "账号正在等待超级管理员审批", code: "ACCOUNT_PENDING" });
  if (state.status === "disabled") return res.status(403).json({ error: "账号已被停用", code: "ACCOUNT_DISABLED" });
  const user = store.authenticate(body.phone, body.password);
  if (!user) return res.status(401).json({ error: "手机号或密码不正确", code: "INVALID_CREDENTIALS" });
  const session = store.createSession({ userId: user.id });
  setSessionCookie(res, session.token, session.expiresAt);
  return res.status(200).json({ user, expiresAt: session.expiresAt });
}
