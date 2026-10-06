const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

let source = fs.readFileSync(path.join(__dirname, "pages/api/settings.js"), "utf8")
  .replace(/^import \{([^}]+)\} from .*auth-session\.cjs.*$/m, "const {$1} = authSession;")
  .replace(/^import \{([^}]+)\} from .*ai-provider\.cjs.*$/m, "const {$1} = provider;")
  .replace(/^export default function handler/m, "function handler");
source += "\nglobalThis.settingsHandler = handler;";
let allowed = false;
const provider = {
  getProviderConfig: () => ({ summary: { status: "configured", configured: true, provider: "zhipu", model: "glm-5.3", baseUrl: "https://open.bigmodel.cn/api/paas/v4" } }),
  saveProviderConfig: () => ({ status: "configured", configured: true, provider: "zhipu", model: "glm-5.3", baseUrl: "https://open.bigmodel.cn/api/paas/v4", restartRequired: true }),
};
const authSession = { requireUser(_req, res, roles) {
  if (!allowed) { res.status(401).json({ error: "请先登录", code: "AUTH_REQUIRED" }); return null; }
  assert.equal(Array.from(roles).join(","), "super_admin");
  return { role: "super_admin" };
} };
const context = { console, JSON, String, URL, process: { env: {} }, authSession, provider };
vm.createContext(context);
vm.runInContext(source, context);

(async () => {
  let status = 0;
  let payload;
  const res = { setHeader() {}, status(value) { status = value; return this; }, json(value) { payload = value; return this; } };
  await context.settingsHandler({ method: "GET", headers: {}, socket: { remoteAddress: "127.0.0.1" } }, res);
  assert.equal(status, 401, "旧设置入口必须拒绝未登录访问");
  allowed = true;
  await context.settingsHandler({ method: "GET", headers: {}, socket: { remoteAddress: "127.0.0.1" } }, res);
  assert.equal(status, 200);
  assert.equal(payload.provider, "zhipu");
  assert.equal(JSON.stringify(payload).includes("apiKey"), false);
  await context.settingsHandler({ method: "POST", body: { apiKey: "browser-secret" }, headers: { origin: "https://evil.example", host: "127.0.0.1:3102" }, socket: { remoteAddress: "127.0.0.1" } }, res);
  assert.equal(status, 403, "旧设置入口也必须拒绝跨来源请求");
  await context.settingsHandler({ method: "POST", body: { apiKey: "browser-secret" }, headers: { host: "127.0.0.1:3102" }, socket: { remoteAddress: "127.0.0.1" } }, res);
  assert.equal(status, 200);
  assert.equal(JSON.stringify(payload).includes("browser-secret"), false);
  console.log("✅ 浏览器本地 API 配置接口权限与脱敏测试通过");
})().catch((error) => { console.error(error); process.exit(1); });
