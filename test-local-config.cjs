/* eslint-disable */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { readLocalConfig, writeLocalConfig, validateSettings, detectEndpointMode, STANDARD_BASE_URL, CODING_PLAN_BASE_URL } = require("./lib/local-config.cjs");

function assert(value, message) {
  if (!value) throw new Error(message);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-config-"));
const envPath = path.join(tempDir, ".env.local");
try {
  fs.writeFileSync(envPath, "OTHER_SETTING=keep-me\nZHIPU_MODEL=old-model\n", { mode: 0o600 });
  const saved = writeLocalConfig({
    apiKey: "new-secret",
    model: "glm-5.3",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
  }, envPath);
  const text = fs.readFileSync(envPath, "utf8");
  assert(text.includes("OTHER_SETTING=keep-me"), "保存 API 配置不得覆盖其他环境变量");
  assert(text.includes("ZAI_API_KEY=new-secret"), "保存 API 配置应写入 ZAI_API_KEY");
  assert(text.includes("ZHIPU_MODEL=glm-5.3"), "保存 API 配置应更新模型");
  assert(saved.configured === true && !("apiKey" in saved), "保存结果不得返回 API Key");
  const loaded = readLocalConfig(envPath);
  assert(loaded.configured === true && loaded.model === "glm-5.3", "应能读取脱敏后的配置状态");
  assert(!JSON.stringify(loaded).includes("new-secret"), "读取结果不得泄露 API Key");
  const normalized = writeLocalConfig({
    apiKey: "",
    model: "glm-5.3",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  }, envPath);
  assert(normalized.baseUrl === "https://open.bigmodel.cn/api/paas/v4", "粘贴完整请求路径时应自动保存为基础端点");
  assert(STANDARD_BASE_URL === "https://open.bigmodel.cn/api/paas/v4", "通用 API 端点常量不正确");
  assert(CODING_PLAN_BASE_URL === "https://open.bigmodel.cn/api/coding/paas/v4", "Coding Plan API 端点常量不正确");
  assert(detectEndpointMode(STANDARD_BASE_URL) === "standard_api", "通用 API 应识别为 standard_api");
  assert(detectEndpointMode(CODING_PLAN_BASE_URL) === "coding_plan", "Coding Plan API 应识别为 coding_plan");
  let rejected = false;
  try { validateSettings({ apiKey: "bad\nkey", model: "glm-5.3", baseUrl: "https://open.bigmodel.cn/api/paas/v4" }); } catch { rejected = true; }
  assert(rejected, "配置值不得包含换行符");
  console.log("✅ 本地 API 配置存储与脱敏测试通过");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
