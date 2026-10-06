import { getCurrentUser, setPrivateNoStore } from "../../../lib/auth-session.cjs";

export default async function handler(req, res) {
  setPrivateNoStore(res);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "仅支持 GET" });
  }
  const user = getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "请先登录", code: "AUTH_REQUIRED" });
  return res.status(200).json({ user });
}
