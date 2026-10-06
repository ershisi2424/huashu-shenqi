const { DEFAULT_BASE_URL, DEFAULT_MODEL, detectEndpointMode, readLocalConfig, readStoredApiKey, validateSettings, writeLocalConfig } = require("./local-config.cjs");

// Provider 调用说明：本模块只负责智谱端点、模型、超时和上游错误映射。
// Runtime 判断和回复安全校验由上层 API 路由负责；不要在这里根据上游错误
// 文案臆测账户状态，也不要把完整 API Key 放进返回值或客户端状态。

function normalizeBaseUrl(value) {
  return (typeof value === "string" && value.trim() ? value.trim() : DEFAULT_BASE_URL)
    .replace(/\/chat\/completions\/?$/i, "")
    .replace(/\/+$/, "");
}

function validateProviderSettings(input = {}) {
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  if (!apiKey) throw new Error("ZAI_API_KEY_REQUIRED");
  const normalized = validateSettings({ apiKey, model: input.model, baseUrl: input.baseUrl });
  return {
    apiKey,
    model: normalized.model || DEFAULT_MODEL,
    baseUrl: normalizeBaseUrl(normalized.baseUrl),
  };
}

function getProviderConfig(env = process.env) {
  const externalPath = typeof env?.AI_REPLY_CONFIG_PATH === "string" && env.AI_REPLY_CONFIG_PATH.trim()
    ? env.AI_REPLY_CONFIG_PATH.trim()
    : "";
  let apiKey = typeof env?.ZAI_API_KEY === "string" ? env.ZAI_API_KEY.trim() : "";
  let model = typeof env?.ZHIPU_MODEL === "string" && env.ZHIPU_MODEL.trim() ? env.ZHIPU_MODEL.trim() : DEFAULT_MODEL;
  let baseUrl = normalizeBaseUrl(env?.ZHIPU_BASE_URL);
  let valid = true;
  if (externalPath) {
    try {
      const fileConfig = readLocalConfig(externalPath);
      apiKey = readStoredApiKey(externalPath);
      model = fileConfig.model || DEFAULT_MODEL;
      baseUrl = normalizeBaseUrl(fileConfig.baseUrl);
    } catch {
      valid = false;
    }
  }
  try {
    validateSettings({ apiKey: apiKey || "placeholder", model, baseUrl });
  } catch {
    valid = false;
  }
  const configured = Boolean(apiKey) && valid;
  return {
    apiKey,
    model,
    baseUrl,
    summary: {
      status: configured ? "configured" : "configuration_required",
      configured,
      provider: "zhipu",
      model,
      baseUrl: valid ? baseUrl : "invalid",
    },
  };
}

function upstreamErrorText(payload = {}) {
  return [
    payload?.error?.message,
    payload?.error?.msg,
    payload?.message,
    payload?.msg,
  ].filter((value) => typeof value === "string").join(" ").trim().toLowerCase();
}

function hasAccountArrearsEvidence(payload = {}) {
  const text = upstreamErrorText(payload);
  return /(余额|欠费|账户余额|账户.{0,8}(欠费|逾期)|insufficient\s+(balance|funds)|balance.{0,20}(insufficient|low)|account.{0,20}(arrears|overdue)|billing|payment)/i.test(text);
}

function classifyProviderError(status, payload = {}) {
  const upstreamCode = String(payload?.error?.code || payload?.code || "");
  if (status === 401 || upstreamCode === "invalid_api_key") return { code: "ZHIPU_KEY_INVALID", status: 502 };
  if (status === 403) return { code: "ZHIPU_FORBIDDEN", status: 502 };
  // 1113 has historically been used by the upstream service for billing/quota
  // failures, but a numeric code alone is not enough evidence to tell a user
  // that their account is in arrears. Require an explicit billing message so
  // model/parameter/plan rejections are not misreported as欠费.
  if (status === 429 && upstreamCode === "1113" && hasAccountArrearsEvidence(payload)) {
    return { code: "ZHIPU_ACCOUNT_ARREARS", status: 429 };
  }
  if (status === 429 && upstreamCode === "1113") return { code: "ZHIPU_REQUEST_FAILED", status: 502 };
  if (status === 429) return { code: "ZHIPU_RATE_LIMIT", status: 429 };
  return { code: "ZHIPU_REQUEST_FAILED", status: 502 };
}

class ProviderRequestError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ProviderRequestError";
    Object.assign(this, details);
  }
}

async function callChatCompletion({ env = process.env, messages, responseFormat, options = {}, fetchImpl = globalThis.fetch, timeoutMs = 75_000 } = {}) {
  const config = getProviderConfig(env);
  if (!config.summary.configured) {
    throw new ProviderRequestError("ZAI_API_KEY_MISSING", { code: "ZAI_API_KEY_MISSING", status: 503 });
  }
  if (typeof fetchImpl !== "function") throw new ProviderRequestError("FETCH_UNAVAILABLE", { code: "FETCH_UNAVAILABLE", status: 503 });
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const body = {
      model: config.model,
      messages: Array.isArray(messages) ? messages : [],
      ...options,
    };
    if (responseFormat) body.response_format = responseFormat;
    const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      ...(controller ? { signal: controller.signal } : {}),
    });
    let payload = {};
    try { payload = await response.json(); } catch { payload = {}; }
    if (!response.ok) {
      const mapped = classifyProviderError(response.status, payload);
      throw new ProviderRequestError(mapped.code, { code: mapped.code, status: mapped.status, upstreamStatus: response.status, payload });
    }
    return { payload, status: response.status, provider: config.summary.provider, model: config.model };
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (error?.name === "AbortError" || error?.name === "TimeoutError") {
      throw new ProviderRequestError("AI_TIMEOUT", { code: "AI_TIMEOUT", status: 504 });
    }
    throw new ProviderRequestError("NETWORK_UNAVAILABLE", { code: "NETWORK_UNAVAILABLE", status: 502 });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function testProviderConnection({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const result = await callChatCompletion({
    env,
    fetchImpl,
    messages: [{ role: "user", content: "只返回 OK" }],
    options: { temperature: 0, thinking: { type: "enabled" }, reasoning_effort: "low" },
    timeoutMs: 20_000,
  });
  const content = result.payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new ProviderRequestError("AI_RESPONSE_INVALID", { code: "AI_RESPONSE_INVALID", status: 502 });
  }
  return { ok: true, provider: result.provider, model: result.model };
}

function saveProviderConfig(input, filePath) {
  const requestedApiKey = typeof input?.apiKey === "string" ? input.apiKey.trim() : "";
  const runningApiKey = typeof process.env.ZAI_API_KEY === "string" ? process.env.ZAI_API_KEY.trim() : "";
  const apiKey = requestedApiKey || readStoredApiKey(filePath) || runningApiKey;
  const validated = validateProviderSettings({ ...input, apiKey });
  const saved = writeLocalConfig(validated, filePath);
  if (filePath && filePath.toLowerCase().endsWith(".json")) process.env.AI_REPLY_CONFIG_PATH = filePath;
  process.env.ZAI_API_KEY = validated.apiKey;
  process.env.ZHIPU_MODEL = saved.model;
  process.env.ZHIPU_BASE_URL = saved.baseUrl;
  return {
    ...getProviderConfig(process.env).summary,
    restartRequired: true,
  };
}

module.exports = {
  ProviderRequestError,
  normalizeBaseUrl,
  detectEndpointMode,
  validateProviderSettings,
  getProviderConfig,
  classifyProviderError,
  callChatCompletion,
  testProviderConnection,
  saveProviderConfig,
};
