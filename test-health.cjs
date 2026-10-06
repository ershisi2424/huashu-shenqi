/* eslint-disable */
const fs = require("fs");
const vm = require("vm");

function assert(value, message) { if (!value) throw new Error(message); }

let source = fs.readFileSync(__dirname + "/pages/api/health.js", "utf8")
  .replace(/^import .*ai-provider\.cjs.*$/m, "const { getProviderConfig } = provider;")
  .replace(/^import .*auth-session\.cjs.*$/m, "const authRequired = () => process.env.AUTH_REQUIRED === 'true' || (process.env.AUTH_REQUIRED !== 'false' && process.env.NODE_ENV === 'production');")
  .replace("export default function handler", "function handler");
source += "\nglobalThis.healthHandler=handler;";
const context = { URL, Boolean, provider: require("./lib/ai-provider.cjs"), process: { env: { ZAI_API_KEY: "secret-not-output", ZHIPU_MODEL: "glm-test", ZHIPU_BASE_URL: "https://example.com/api/paas/v4/chat/completions", AUTH_REQUIRED: "false" } } };
vm.createContext(context);
vm.runInContext(source, context);

(async () => {
  let status = 0;
  let payload;
  const res = { setHeader() {}, status(value) { status = value; return this; }, json(value) { payload = value; } };
  context.healthHandler({ method: "GET" }, res);
  assert(status === 200, "健康检查应返回 200");
  assert(payload.status === "configured", "完整配置应标记 configured");
  assert(payload.provider === "zhipu", "健康检查应标记智谱服务商");
  assert(payload.model === "glm-test", "健康检查应返回智谱模型");
  assert(payload.baseUrl === "https://example.com/api/paas/v4", "健康检查应规范化完整请求端点");
  assert(payload.configured === true, "健康检查应显示已配置但不返回密钥");
  assert(!JSON.stringify(payload).includes("secret-not-output"), "健康检查不得泄露密钥");
  context.healthHandler({ method: "POST" }, res);
  assert(status === 405, "健康检查应拒绝非 GET");
  delete context.process.env.ZAI_API_KEY;
  context.process.env.DASHSCOPE_API_KEY = "legacy-key-should-not-be-used";
  context.healthHandler({ method: "GET" }, res);
  assert(payload.status === "configuration_required" && payload.configured === false, "旧百炼 Key 不应标记为已配置");
  console.log("✅ 智谱 GLM-5.3 配置健康检查测试通过");
})().catch(error => { console.error(error); process.exit(1); });
