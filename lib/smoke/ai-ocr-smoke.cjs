const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const SYNTHETIC_MESSAGE = "今天刚下班，有点累。";
const SYNTHETIC_ACCOUNT = "synthetic-smoke";

function validateBaseUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!(["http:", "https:"].includes(url.protocol) && LOOPBACK_HOSTS.has(url.hostname))) {
      return { ok: false, error: "SMOKE_BASE_URL_NOT_LOOPBACK" };
    }
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return { ok: true, url: url.toString().replace(/\/$/, "") };
  } catch {
    return { ok: false, error: "SMOKE_BASE_URL_INVALID" };
  }
}

function durationSince(startedAt) {
  return Math.max(0, Date.now() - startedAt);
}

function staticHint(code) {
  const hints = {
    SMOKE_BASE_URL_INVALID: "目标地址格式无效；使用 http://127.0.0.1:3102",
    SMOKE_BASE_URL_NOT_LOOPBACK: "联调脚本只允许本机回环地址，不会向远程地址发送素材",
    NETWORK_UNAVAILABLE: "请确认 Next.js 服务已启动并监听本机端口",
    SERVICE_CONFIG_INVALID: "请检查 /api/health 返回的服务商和模型是否为 zhipu / glm-5.3",
    ZAI_API_KEY_MISSING: "请在服务端配置 ZAI_API_KEY；配置读取不等于真实调用成功",
    AUTH_REQUIRED: "当前服务要求登录；设置 SMOKE_SESSION_COOKIE 后重试本机联调",
    ZHIPU_KEY_INVALID: "请更新服务端 ZAI_API_KEY，并重新启动 Next.js",
    ZHIPU_FORBIDDEN: "请确认当前智谱账号有权调用 GLM-5.3",
    ZHIPU_RATE_LIMIT: "等待智谱限流窗口恢复后再试，避免重复点击",
    ZHIPU_ACCOUNT_ARREARS: "上游返回余额/额度类错误（不等于已确认欠费）；请核对 Coding Plan 与资源包对应的接口端点",
    AI_TIMEOUT: "检查网络和智谱响应时间，稍后重试",
    INVALID_AI_SCHEMA: "AI 已返回但结构不符合应用契约，请重试并保留脱敏错误码",
    AI_RESPONSE_INVALID: "请检查服务端是否返回 provider、model、核心算法和多元回复",
    OCR_IMAGE_INVALID: "请检查合成 PNG 是否完整、格式正确且不超过 8MB",
    OCR_DEPENDENCY_UNAVAILABLE: "请安装 tesseract.js 依赖并检查目标 Node.js 环境",
    OCR_LANGUAGE_DATA_UNAVAILABLE: "请检查 OCR_LANG 语言包首次下载、网络和文件权限",
    OCR_EMPTY_RESULT: "OCR 服务可用但没有识别到文字；检查字体、图片清晰度和语言包",
    OCR_RESPONSE_INVALID: "请检查 OCR 是否返回人工确认标志、blocks 和 imageStored 字段",
    INVALID_JSON_RESPONSE: "服务响应不是合法 JSON，请查看服务端状态而不要打印原始响应",
  };
  return hints[code] || "请查看本阶段错误码并在本机修复后重试";
}

function payloadCode(payload) {
  if (!payload || typeof payload !== "object") return "";
  return typeof payload.code === "string" ? payload.code : typeof payload.error?.code === "string" ? payload.error.code : "";
}

function payloadText(payload) {
  if (!payload || typeof payload !== "object") return "";
  const error = typeof payload.error === "string" ? payload.error : payload.error?.message;
  return `${payloadCode(payload)} ${error || ""}`.toLowerCase();
}

function classifyFailure(stage, status, payload) {
  const code = payloadCode(payload);
  const text = payloadText(payload);
  if (code === "AUTH_REQUIRED" || status === 401 && stage !== "ai") return { code: "AUTH_REQUIRED", hint: staticHint("AUTH_REQUIRED") };
  if (stage === "ai") {
    if (code === "ZAI_API_KEY" || text.includes("zai_api_key") || text.includes("未配置智谱")) return { code: "ZAI_API_KEY_MISSING", hint: staticHint("ZAI_API_KEY_MISSING") };
    if (code === "ZHIPU_ACCOUNT_ARREARS" || code === "1113" || text.includes("1113")) return { code: "ZHIPU_ACCOUNT_ARREARS", hint: staticHint("ZHIPU_ACCOUNT_ARREARS") };
    if (code === "ZHIPU_RATE_LIMIT" || status === 429) return { code: "ZHIPU_RATE_LIMIT", hint: staticHint("ZHIPU_RATE_LIMIT") };
    if (code === "ZHIPU_KEY_INVALID" || status === 401 || text.includes("invalid_api_key") || text.includes("api key 无效")) return { code: "ZHIPU_KEY_INVALID", hint: staticHint("ZHIPU_KEY_INVALID") };
    if (code === "ZHIPU_FORBIDDEN" || status === 403 || text.includes("没有调用权限")) return { code: "ZHIPU_FORBIDDEN", hint: staticHint("ZHIPU_FORBIDDEN") };
    if (code === "INVALID_AI_SCHEMA" || text.includes("格式不合格")) return { code: "INVALID_AI_SCHEMA", hint: staticHint("INVALID_AI_SCHEMA") };
    if (code === "AI_TIMEOUT" || text.includes("超时")) return { code: "AI_TIMEOUT", hint: staticHint("AI_TIMEOUT") };
    return { code: code || "AI_REQUEST_FAILED", hint: staticHint(code || "AI_REQUEST_FAILED") };
  }
  if (stage === "ocr") {
    if (code === "OCR_DEPENDENCY_UNAVAILABLE") return { code, hint: staticHint(code) };
    if (["LANGUAGE_DATA_UNAVAILABLE", "TESSERACT_LANGUAGE_DATA_UNAVAILABLE", "OCR_LANGUAGE_DATA_UNAVAILABLE"].includes(code) || text.includes("language data") || text.includes("语言包")) return { code: "OCR_LANGUAGE_DATA_UNAVAILABLE", hint: staticHint("OCR_LANGUAGE_DATA_UNAVAILABLE") };
    if (status === 400 || ["INVALID_IMAGE_DATA_URL", "UNSUPPORTED_IMAGE_TYPE", "IMAGE_TOO_LARGE"].includes(code)) return { code: "OCR_IMAGE_INVALID", hint: staticHint("OCR_IMAGE_INVALID") };
    return { code: code || "OCR_REQUEST_FAILED", hint: staticHint(code || "OCR_REQUEST_FAILED") };
  }
  if (status >= 500) return { code: "NETWORK_UNAVAILABLE", hint: staticHint("NETWORK_UNAVAILABLE") };
  return { code: code || "SERVICE_REQUEST_FAILED", hint: staticHint(code || "SERVICE_REQUEST_FAILED") };
}

function stageResult(stage, startedAt, details = {}) {
  return { stage, ok: true, durationMs: durationSince(startedAt), details };
}

function failedStage(stage, startedAt, failure) {
  return { stage, ok: false, durationMs: durationSince(startedAt), code: failure.code, hint: failure.hint };
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function validateAiResult(payload) {
  if (!payload || payload.provider !== "zhipu" || payload.model !== "glm-5.3") return { ok: false, code: "AI_RESPONSE_INVALID" };
  if (payload.algorithmCore?.name !== "goutoujunshi" || !payload.coreDecision?.action) return { ok: false, code: "AI_RESPONSE_INVALID" };
  if (!payload.profile || typeof payload.profile.summary !== "string") return { ok: false, code: "AI_RESPONSE_INVALID" };
  const replies = Array.isArray(payload.replies) ? payload.replies : [];
  if (replies.length < 4 || replies.length > 8) return { ok: false, code: "AI_RESPONSE_INVALID" };
  const styles = new Set();
  for (const reply of replies) {
    if (!reply || typeof reply.text !== "string" || !reply.text.trim() || typeof reply.style !== "string" || !reply.style.trim()) return { ok: false, code: "AI_RESPONSE_INVALID" };
    if (!reply.sendWhen || !reply.observationWindow || !reply.stopCondition) return { ok: false, code: "AI_RESPONSE_INVALID" };
    if (!reply.branches?.positive || !reply.branches?.ambiguous || !reply.branches?.refusal) return { ok: false, code: "AI_RESPONSE_INVALID" };
    styles.add(reply.style);
  }
  if (styles.size !== replies.length) return { ok: false, code: "AI_RESPONSE_INVALID" };
  return { ok: true, details: { replyCount: replies.length, styleCount: styles.size, core: payload.algorithmCore.name } };
}

function validateOcrResult(payload) {
  if (!payload || payload.requiresConfirmation !== true || payload.imageStored !== false || !Array.isArray(payload.blocks)) return { ok: false, code: "OCR_RESPONSE_INVALID" };
  if (!payload.blocks.length) return { ok: false, code: "OCR_EMPTY_RESULT" };
  if (payload.blocks.some((block) => typeof block?.text !== "string" || !block.text.trim() || !["brother", "anchor", "unknown"].includes(block.sender))) return { ok: false, code: "OCR_RESPONSE_INVALID" };
  return { ok: true, details: { blockCount: payload.blocks.length, sender: "layout-inferred", requiresConfirmation: true } };
}

function requestFor(fetchImpl, baseUrl, path, options) {
  return fetchImpl(`${baseUrl}${path}`, options);
}

async function runSmoke({ baseUrl = "http://127.0.0.1:3102", request = globalThis.fetch, imageBuffer, cookie = "" } = {}) {
  const validation = validateBaseUrl(baseUrl);
  if (!validation.ok) return { ok: false, stages: [{ stage: "input", ok: false, durationMs: 0, code: validation.error, hint: staticHint(validation.error) }] };
  if (typeof request !== "function") return { ok: false, stages: [{ stage: "health", ok: false, durationMs: 0, code: "NETWORK_UNAVAILABLE", hint: staticHint("NETWORK_UNAVAILABLE") }] };
  if (!Buffer.isBuffer(imageBuffer) || !imageBuffer.length) return { ok: false, stages: [{ stage: "input", ok: false, durationMs: 0, code: "OCR_IMAGE_INVALID", hint: staticHint("OCR_IMAGE_INVALID") }] };
  const headers = { Accept: "application/json" };
  if (cookie) headers.Cookie = cookie;
  const stages = [];
  const call = async (stage, path, options) => {
    const startedAt = Date.now();
    try {
      const response = await requestFor(request, validation.url, path, options);
      const payload = await readJson(response);
      return { response, payload, startedAt };
    } catch {
      const failure = { code: "NETWORK_UNAVAILABLE", hint: staticHint("NETWORK_UNAVAILABLE") };
      const result = failedStage(stage, startedAt, failure);
      stages.push(result);
      return null;
    }
  };

  const healthCall = await call("health", "/api/health", { method: "GET", headers });
  if (!healthCall) return { ok: false, stages };
  if (!healthCall.response.ok) {
    const result = failedStage("health", healthCall.startedAt, classifyFailure("health", healthCall.response.status, healthCall.payload));
    stages.push(result);
    return { ok: false, stages };
  }
  const health = healthCall.payload;
  if (health?.provider !== "zhipu" || health?.model !== "glm-5.3") {
    stages.push(failedStage("health", healthCall.startedAt, { code: "SERVICE_CONFIG_INVALID", hint: staticHint("SERVICE_CONFIG_INVALID") }));
    return { ok: false, stages };
  }
  if (health?.configured !== true || health?.status !== "configured") {
    stages.push(failedStage("health", healthCall.startedAt, { code: "ZAI_API_KEY_MISSING", hint: staticHint("ZAI_API_KEY_MISSING") }));
    return { ok: false, stages };
  }
  stages.push(stageResult("health", healthCall.startedAt, { provider: "zhipu", model: "glm-5.3", configured: true }));

  const aiCall = await call("ai", "/api/profile", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ consent: true, account: SYNTHETIC_ACCOUNT, currentMessage: SYNTHETIC_MESSAGE, works: "合成素材：喜欢下班后散步。", comments: "合成评论：最近工作有点忙。", statements: "合成公开发言：周末想休息。", history: [{ msg: "最近工作怎么样？", reply: "还行，就是有点忙。" }], replyCount: 4, replyPreferences: ["自然聊天", "温柔关心", "轻松幽默", "成熟克制"] }),
  });
  if (!aiCall) return { ok: false, stages };
  if (!aiCall.response.ok) {
    stages.push(failedStage("ai", aiCall.startedAt, classifyFailure("ai", aiCall.response.status, aiCall.payload)));
    return { ok: false, stages };
  }
  const aiValidation = validateAiResult(aiCall.payload);
  if (!aiValidation.ok) {
    stages.push(failedStage("ai", aiCall.startedAt, { code: aiValidation.code, hint: staticHint(aiValidation.code) }));
    return { ok: false, stages };
  }
  stages.push(stageResult("ai", aiCall.startedAt, aiValidation.details));

  const imageDataUrl = `data:image/png;base64,${imageBuffer.toString("base64")}`;
  const ocrCall = await call("ocr", "/api/ocr", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl, language: "chi_sim+eng" }),
  });
  if (!ocrCall) return { ok: false, stages };
  if (!ocrCall.response.ok) {
    stages.push(failedStage("ocr", ocrCall.startedAt, classifyFailure("ocr", ocrCall.response.status, ocrCall.payload)));
    return { ok: false, stages };
  }
  const ocrValidation = validateOcrResult(ocrCall.payload);
  if (!ocrValidation.ok) {
    stages.push(failedStage("ocr", ocrCall.startedAt, { code: ocrValidation.code, hint: staticHint(ocrValidation.code) }));
    return { ok: false, stages };
  }
  stages.push(stageResult("ocr", ocrCall.startedAt, ocrValidation.details));
  return { ok: true, stages };
}

module.exports = {
  SYNTHETIC_MESSAGE,
  SYNTHETIC_ACCOUNT,
  validateBaseUrl,
  classifyFailure,
  validateAiResult,
  validateOcrResult,
  runSmoke,
};
