import { getAuthStore, setPrivateNoStore } from "../../../lib/auth-session.cjs";
import { createSetupState } from "../../../lib/setup-state.cjs";

function isLoopback(req) {
  const address = String(req?.socket?.remoteAddress || req?.connection?.remoteAddress || "").toLowerCase();
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function bodyOf(req) {
  return req.body && typeof req.body === "object" ? req.body : {};
}

export default function handler(req, res) {
  setPrivateNoStore(res);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "仅支持 POST" });
  }
  if (!isLoopback(req)) return res.status(403).json({ error: "首次初始化只能在服务器本机进行", code: "SETUP_LOCAL_ONLY" });
  const store = getAuthStore();
  if (store.hasActiveSuperAdmin()) return res.status(409).json({ error: "最高管理员已初始化", code: "BOOTSTRAP_ADMIN_EXISTS" });
  const body = bodyOf(req);
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const submittedValue = body.password;
  const passcode = typeof submittedValue === "string" ? submittedValue : "";
  if (!code || !phone || !name || passcode.length < 8 || passcode.length > 128) {
    return res.status(400).json({ error: "请填写有效的初始化码、手机号、名称和至少 8 位密码", code: "SETUP_INPUT_INVALID" });
  }
  const state = createSetupState();
  if (!state.verify(code)) {
    const current = state.status();
    if (current.locked) return res.status(429).json({ error: "初始化码失败次数过多，请重新生成", code: "SETUP_ATTEMPTS_EXCEEDED" });
    if (current.expired) return res.status(410).json({ error: "初始化码已过期，请重新生成", code: "SETUP_EXPIRED" });
    return res.status(401).json({ error: "初始化码不正确", code: "SETUP_INVALID" });
  }
  try {
    const user = store.ensureBootstrapAdmin({ phone, name, password: passcode });
    return res.status(201).json({ user, message: "最高管理员已初始化，请使用新账号登录" });
  } catch (error) {
    if (["INVALID_PHONE", "INVALID_PASSWORD"].includes(error?.message)) return res.status(400).json({ error: "手机号或密码格式无效", code: error.message });
    if (error?.message === "BOOTSTRAP_PHONE_CONFLICT") return res.status(409).json({ error: "该手机号已被其他角色使用", code: error.message });
    if (error?.message === "BOOTSTRAP_ADMIN_EXISTS") return res.status(409).json({ error: "最高管理员已初始化", code: error.message });
    console.error("Bootstrap setup failed", error?.message || "Error");
    return res.status(500).json({ error: "初始化失败，请重新生成初始化码", code: "SETUP_FAILED" });
  }
}
