import { getAuthStore, setPrivateNoStore } from "../../../lib/auth-session.cjs";
import { createSetupState } from "../../../lib/setup-state.cjs";

function isLoopback(req) {
  const address = String(req?.socket?.remoteAddress || req?.connection?.remoteAddress || "").toLowerCase();
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

export default function handler(req, res) {
  setPrivateNoStore(res);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "仅支持 GET" });
  }
  if (!isLoopback(req)) return res.status(403).json({ error: "首次初始化只能在服务器本机进行", code: "SETUP_LOCAL_ONLY" });
  const store = getAuthStore();
  if (store.hasActiveSuperAdmin()) return res.status(200).json({ setupRequired: false, code: "BOOTSTRAP_ADMIN_EXISTS" });
  const state = createSetupState().status();
  return res.status(200).json({ setupRequired: true, code: state.active ? "SETUP_REQUIRED" : state.locked ? "SETUP_ATTEMPTS_EXCEEDED" : state.expired ? "SETUP_EXPIRED" : "SETUP_REQUIRED", expiresAt: state.active ? state.expiresAt : null });
}
