import { getAuthStore, setPrivateNoStore } from "../../../lib/auth-session.cjs";

export default async function handler(req, res) {
  setPrivateNoStore(res);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "仅支持 GET" });
  }
  try {
    return res.status(200).json({ items: getAuthStore().listActiveOperators() });
  } catch (error) {
    console.error("Public operator list failed", error?.message || "Error");
    return res.status(500).json({ error: "运营列表暂时不可用" });
  }
}
