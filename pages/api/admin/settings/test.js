import { requireUser } from "../../../../lib/auth-session.cjs";
import { testProviderConnection } from "../../../../lib/ai-provider.cjs";

function isSameOrigin(req) {
  const origin = String(req?.headers?.origin || "").trim();
  if (!origin) return true;
  try {
    return new URL(origin).host === String(req?.headers?.host || "").trim();
  } catch {
    return false;
  }
}

function safeError(error) {
  const messages = {
    ZAI_API_KEY_MISSING: [503, "尚未配置智谱 API Key"],
    ZHIPU_KEY_INVALID: [502, "智谱 API Key 无效或已过期"],
    ZHIPU_FORBIDDEN: [502, "当前账号没有调用 GLM-5.3 的权限"],
    ZHIPU_RATE_LIMIT: [429, "智谱接口请求过于频繁，请稍后重试"],
    ZHIPU_ACCOUNT_ARREARS: [429, "智谱上游返回余额/额度类错误（不等于账户欠费）；请核对 API Key 类型与接口端点"],
    ZHIPU_REQUEST_FAILED: [502, "智谱上游拒绝了请求；这不等于账户欠费，请核对 API Key 类型、接口端点、模型权限和请求参数"],
    AI_TIMEOUT: [504, "智谱测试调用超时，请稍后重试"],
    AI_RESPONSE_INVALID: [502, "智谱已响应，但返回结构无法确认"],
    NETWORK_UNAVAILABLE: [502, "智谱服务暂时不可达"],
  };
  const code = error?.code || "PROVIDER_TEST_FAILED";
  const [status, message] = messages[code] || [502, "智谱测试调用失败"];
  const upstreamCode = String(error?.payload?.error?.code || error?.payload?.code || "").trim();
  const diagnostics = {};
  if (Number.isFinite(Number(error?.upstreamStatus))) diagnostics.upstreamStatus = Number(error.upstreamStatus);
  if (upstreamCode) diagnostics.upstreamCode = upstreamCode;
  return { status, message, code, diagnostics: Object.keys(diagnostics).length ? diagnostics : undefined };
}

export default async function handler(req, res) {
  const actor = requireUser(req, res, ["super_admin"]);
  if (!actor) return null;
  if (!isSameOrigin(req)) return res.status(403).json({ error: "请求来源不受信任", code: "ORIGIN_INVALID" });
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "仅支持 POST" });
  }
  try {
    const result = await testProviderConnection({ env: process.env, fetchImpl: fetch });
    return res.status(200).json({ ...result, testedAt: new Date().toISOString(), note: "真实测试调用成功；没有保存测试内容" });
  } catch (error) {
    const safe = safeError(error);
    const payload = { error: safe.message, code: safe.code };
    if (safe.diagnostics) payload.diagnostics = safe.diagnostics;
    return res.status(safe.status).json(payload);
  }
}
