const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const provider = require("./lib/ai-provider.cjs");
const { writeProviderConfig } = require("./lib/provider-config-file.cjs");

assert.equal(provider.normalizeBaseUrl("https://open.bigmodel.cn/api/paas/v4/chat/completions"), "https://open.bigmodel.cn/api/paas/v4");
assert.equal(provider.normalizeBaseUrl("https://open.bigmodel.cn/api/paas/v4/"), "https://open.bigmodel.cn/api/paas/v4");
assert.equal(provider.detectEndpointMode("https://open.bigmodel.cn/api/coding/paas/v4"), "coding_plan");
assert.equal(provider.detectEndpointMode("https://open.bigmodel.cn/api/paas/v4"), "standard_api");
assert.throws(() => provider.validateProviderSettings({ apiKey: "", model: "glm-5.3", baseUrl: "https://open.bigmodel.cn/api/paas/v4" }), /ZAI_API_KEY_REQUIRED/);
assert.throws(() => provider.validateProviderSettings({ apiKey: "secret", model: "glm test", baseUrl: "https://open.bigmodel.cn/api/paas/v4" }), /ZHIPU_MODEL_INVALID/);
assert.throws(() => provider.validateProviderSettings({ apiKey: "secret", model: "glm-5.3", baseUrl: "http://remote.example/api" }), /ZHIPU_BASE_URL_INVALID/);

const config = provider.getProviderConfig({ ZAI_API_KEY: "server-secret", ZHIPU_MODEL: "glm-5.3", ZHIPU_BASE_URL: "https://open.bigmodel.cn/api/paas/v4" });
assert.deepEqual(config.summary, { status: "configured", configured: true, provider: "zhipu", model: "glm-5.3", baseUrl: "https://open.bigmodel.cn/api/paas/v4" });
assert.equal(JSON.stringify(config.summary).includes("server-secret"), false);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-provider-"));
const tempConfigPath = path.join(tempDir, ".env.local");
const externalConfigPath = path.join(tempDir, "provider.json");
const previousEnv = {
  ZAI_API_KEY: process.env.ZAI_API_KEY,
  ZHIPU_MODEL: process.env.ZHIPU_MODEL,
  ZHIPU_BASE_URL: process.env.ZHIPU_BASE_URL,
};
try {
  fs.writeFileSync(tempConfigPath, [
    "ZAI_API_KEY=stored-secret",
    "ZHIPU_MODEL=glm-5.2",
    "ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4",
    "",
  ].join("\n"), { mode: 0o600 });
  delete process.env.ZAI_API_KEY;
  delete process.env.ZHIPU_MODEL;
  delete process.env.ZHIPU_BASE_URL;
  const savedWithoutReplacingKey = provider.saveProviderConfig({
    apiKey: "",
    model: "glm-5.3",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
  }, tempConfigPath);
  assert.equal(process.env.ZAI_API_KEY, "stored-secret", "留空 API Key 时应从已有配置恢复服务端 Key");
  assert.equal(savedWithoutReplacingKey.model, "glm-5.3");
  assert.equal(JSON.stringify(savedWithoutReplacingKey).includes("stored-secret"), false, "保存响应不得泄露恢复的 Key");

  writeProviderConfig(externalConfigPath, {
    ZAI_API_KEY: "external-file-secret",
    ZHIPU_MODEL: "glm-5.3",
    ZHIPU_BASE_URL: "https://example.test/v4",
  });
  const externalConfig = provider.getProviderConfig({
    AI_REPLY_CONFIG_PATH: externalConfigPath,
    ZAI_API_KEY: "stale-process-secret",
    ZHIPU_MODEL: "stale-model",
  });
  assert.equal(externalConfig.summary.configured, true);
  assert.equal(externalConfig.summary.baseUrl, "https://example.test/v4");
  assert.equal(JSON.stringify(externalConfig.summary).includes("external-file-secret"), false);
} finally {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (typeof value === "undefined") delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
}

(async () => {
  let received;
  const result = await provider.callChatCompletion({
    env: { ZAI_API_KEY: "server-secret", ZHIPU_MODEL: "glm-5.3", ZHIPU_BASE_URL: "https://open.bigmodel.cn/api/paas/v4" },
    messages: [{ role: "user", content: "合成测试" }],
    fetchImpl: async (url, options) => {
      received = { url, options };
      return { ok: true, status: 200, async json() { return { choices: [{ message: { content: JSON.stringify({ ok: true }) } }] }; } };
    },
  });
  assert.equal(result.payload.choices[0].message.content, '{"ok":true}');
  assert.equal(received.url, "https://open.bigmodel.cn/api/paas/v4/chat/completions");
  assert.equal(received.options.headers.Authorization, "Bearer server-secret");
  assert.equal(JSON.parse(received.options.body).model, "glm-5.3");

  let testRequest;
  const testResult = await provider.testProviderConnection({
    env: { ZAI_API_KEY: "server-secret", ZHIPU_MODEL: "glm-5.3", ZHIPU_BASE_URL: "https://open.bigmodel.cn/api/paas/v4" },
    fetchImpl: async (url, options) => {
      testRequest = { url, options };
      return { ok: true, status: 200, async json() { return { choices: [{ message: { content: "OK" } }] }; } };
    },
  });
  assert.equal(testResult.ok, true);
  const testBody = JSON.parse(testRequest.options.body);
  assert.deepEqual(testBody.thinking, { type: "enabled" }, "GLM-5.3 测试调用必须启用思考");
  assert.equal(testBody.reasoning_effort, "low", "GLM-5.3 测试调用应使用低思考强度");
  assert.equal("response_format" in testBody, false, "连通性测试不应额外依赖结构化输出参数");

  assert.deepEqual(provider.classifyProviderError(401, { error: { code: "invalid_api_key" } }), { code: "ZHIPU_KEY_INVALID", status: 502 });
  assert.deepEqual(provider.classifyProviderError(429, { error: { code: "1113", message: "账户余额不足" } }), { code: "ZHIPU_ACCOUNT_ARREARS", status: 429 });
  assert.deepEqual(provider.classifyProviderError(429, { error: { code: "1113", message: "当前模型不支持该请求参数" } }), { code: "ZHIPU_REQUEST_FAILED", status: 502 }, "没有账务证据时不得误报欠费");
  assert.deepEqual(provider.classifyProviderError(429, { error: { code: "1113", message: "当前套餐额度不足" } }), { code: "ZHIPU_REQUEST_FAILED", status: 502 }, "套餐额度问题不得直接标成账户欠费");
  console.log("test-ai-provider: ok");
})().catch((error) => { console.error(error); process.exit(1); });
