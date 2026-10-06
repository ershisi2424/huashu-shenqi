import { requireUser } from "../../../lib/auth-session.cjs";
import { getProviderConfig, saveProviderConfig } from "../../../lib/ai-provider.cjs";

function configPath() {
  return process.env.AI_REPLY_CONFIG_PATH || undefined;
}

function isSameOrigin(req) {
  const origin = String(req?.headers?.origin || "").trim();
  if (!origin) return true;
  try {
    return new URL(origin).host === String(req?.headers?.host || "").trim();
  } catch {
    return false;
  }
}

export default function handler(req, res) {
  const actor = requireUser(req, res, ["super_admin"]);
  if (!actor) return null;
  if (!isSameOrigin(req)) return res.status(403).json({ error: "请求来源不受信任", code: "ORIGIN_INVALID" });
  if (req.method === "GET") {
    return res.status(200).json({
      ...getProviderConfig(process.env).summary,
      note: "配置状态已脱敏，不返回 API Key",
    });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "仅支持 GET 或 POST" });
  }
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const saved = saveProviderConfig({
      apiKey: body.apiKey,
      model: body.model,
      baseUrl: body.baseUrl,
    }, configPath());
    return res.status(200).json({
      ...saved,
      note: "配置已保存；建议重启服务，确保所有进程读取最新配置",
    });
  } catch (error) {
    const messages = {
      ZAI_API_KEY_REQUIRED: "请填写智谱 API Key，或保留已有 Key",
      ZAI_API_KEY_INVALID: "API Key 格式无效",
      ZHIPU_MODEL_INVALID: "模型名只能包含字母、数字、点、下划线和短横线",
      ZHIPU_BASE_URL_INVALID: "接口地址必须是 HTTPS 地址，或本机 HTTP 地址",
    };
    return res.status(400).json({ error: messages[error?.message] || "API 配置保存失败，请检查填写内容和文件权限", code: error?.message || "SETTINGS_SAVE_FAILED" });
  }
}
