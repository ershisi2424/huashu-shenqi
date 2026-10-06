import { getAuthStore, requireUser, setPrivateNoStore } from "../../../lib/auth-session.cjs";

function bodyOf(req) {
  return req.body && typeof req.body === "object" ? req.body : {};
}

export default async function handler(req, res) {
  setPrivateNoStore(res);
  const operator = requireUser(req, res, ["operator"]);
  if (!operator) return null;
  const store = getAuthStore();
  if (req.method === "GET") return res.status(200).json({ items: store.listAnchorsForOperator(operator.id) });
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "仅支持 GET 或 POST" });
  }
  const body = bodyOf(req);
  try {
    const user = store.createAnchor({ operatorId: operator.id, phone: body.phone, name: body.name, password: body.password });
    return res.status(201).json({ user });
  } catch (error) {
    if (error?.message === "PHONE_ALREADY_REGISTERED") return res.status(409).json({ error: "手机号已注册", code: error.message });
    if (["INVALID_PHONE", "INVALID_PASSWORD", "NAME_REQUIRED"].includes(error?.message)) return res.status(400).json({ error: "请检查主播手机号、昵称和密码（密码至少 8 位）", code: error.message });
    if (error?.message === "ACTIVE_OPERATOR_REQUIRED") return res.status(403).json({ error: "运营账号尚未生效", code: "FORBIDDEN" });
    console.error("Anchor create failed", error?.message || "Error");
    return res.status(500).json({ error: "新增主播账号暂时失败" });
  }
}
