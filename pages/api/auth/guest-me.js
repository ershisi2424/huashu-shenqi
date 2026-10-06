import { clearGuestSessionCookie, getAuthStore, readGuestSessionToken, setGuestSessionCookie, setPrivateNoStore } from "../../../lib/auth-session.cjs";

export default async function handler(req, res) {
  setPrivateNoStore(res);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "仅支持 GET" });
  }
  const store = getAuthStore();
  store.cleanupGuestData();
  const token = readGuestSessionToken(req);
  const guest = token ? store.touchGuestSession(token) : null;
  if (!guest) {
    clearGuestSessionCookie(res);
    return res.status(401).json({ error: "游客会话已失效", code: "GUEST_AUTH_REQUIRED" });
  }
  setGuestSessionCookie(res, token, guest.expiresAt);
  return res.status(200).json({ guest });
}
