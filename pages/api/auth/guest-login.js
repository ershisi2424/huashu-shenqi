import { clearSessionCookie, getAuthStore, readSessionToken, rejectAuthRateLimit, setGuestSessionCookie, setPrivateNoStore } from "../../../lib/auth-session.cjs";

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
  if (rejectAuthRateLimit(req, res, { scope: "auth.guest-login", phone: body.phone, envPrefix: "AUTH_GUEST_RATE_LIMIT", maxRequests: 5, windowMs: 60 * 60 * 1000 })) return;
  try {
    const store = getAuthStore();
    store.cleanupGuestData();
    const session = store.createGuestSession(body.phone);
    // A browser may still carry a formal cookie when the operator chooses the
    // temporary workspace. Revoke it before returning the guest cookie so the
    // chat bootstrap cannot prefer the formal identity over guest:<id>.
    const formalToken = readSessionToken(req);
    if (formalToken) {
      store.revokeSession(formalToken);
      clearSessionCookie(res);
    }
    setGuestSessionCookie(res, session.token, session.guest.expiresAt);
    return res.status(200).json({ guest: session.guest });
  } catch (error) {
    if (error?.message === "INVALID_PHONE") return res.status(400).json({ error: "请输入有效手机号", code: "INVALID_PHONE" });
    console.error("Guest login failed", error?.message || "Error");
    return res.status(500).json({ error: "游客登录暂时不可用" });
  }
}
