import { getProviderConfig } from "../../lib/ai-provider.cjs";
import { authRequired } from "../../lib/auth-session.cjs";

function sanitizeBaseUrl(value) {
  const fallback = "https://open.bigmodel.cn/api/paas/v4";
  try {
    const url = new URL(value || fallback);
    const pathname = url.pathname.replace(/\/chat\/completions\/?$/i, "").replace(/\/$/, "");
    return `${url.protocol}//${url.host}${pathname}`;
  } catch {
    return "invalid";
  }
}

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "仅支持 GET" });
  }
  const providerConfig = getProviderConfig(process.env);
  const configured = providerConfig.summary.configured;
  const authenticationRequired = authRequired();
  const baseUrl = sanitizeBaseUrl(providerConfig.summary.baseUrl);
  const model = providerConfig.summary.model;
  return res.status(200).json({
    status: configured && baseUrl !== "invalid" ? "configured" : "configuration_required",
    provider: "zhipu",
    configured,
    authRequired: authenticationRequired,
    model,
    baseUrl,
    runtime: {
      uptimeSeconds: typeof process.uptime === "function" ? Math.round(process.uptime()) : null,
      nodeVersion: typeof process.version === "string" ? process.version : null,
    },
    note: configured ? "配置已读取；实际权限仍需通过 /api/profile 验证" : "请在服务端配置 ZAI_API_KEY",
  });
}
