import { clearGuestSessionCookie, clearSessionCookie, getAuthStore, readGuestSessionToken, readSessionToken, setPrivateNoStore } from "../../../lib/auth-session.cjs";

export default async function handler(req, res) {
  setPrivateNoStore(res);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "仅支持 POST" });
  }
  const token = readSessionToken(req);
  if (token) getAuthStore().revokeSession(token);
  const guestToken = readGuestSessionToken(req);
  const store = getAuthStore();
  if (guestToken) store.revokeGuestSession(guestToken);
  store.cleanupGuestData();
  clearSessionCookie(res);
  clearGuestSessionCookie(res);
  return res.status(204).end();
}
