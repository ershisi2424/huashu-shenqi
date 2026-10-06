const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadHandler(relativePath, authSession, provider) {
  let source = fs.readFileSync(path.join(__dirname, relativePath), "utf8")
    .replace(/^import \{([^}]+)\} from .*auth-session\.cjs.*$/m, "const {$1} = authSession;")
    .replace(/^import \{([^}]+)\} from .*ai-provider\.cjs.*$/m, "const {$1} = provider;")
    .replace(/^export default (?:async )?function handler/m, "async function handler");
  const context = { console, JSON, String, URL, Number, Date, fetch: async () => ({ ok: true, status: 200, async json() { return {}; } }), process, authSession, provider };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.handler = handler;`, context);
  return context.handler;
}

async function call(handler, { method = "GET", body = {}, user = null } = {}) {
  let status = 200;
  let payload;
  const res = {
    status(value) { status = value; return this; },
    json(value) { payload = value; return this; },
    setHeader() {},
  };
  const authSession = { requireUser(_req, response, roles) {
    if (!user) { response.status(401).json({ error: "请先登录", code: "AUTH_REQUIRED" }); return null; }
    if (!roles.includes(user.role)) { response.status(403).json({ error: "无权限", code: "FORBIDDEN" }); return null; }
    return user;
  } };
  return { status, payload, authSession, req: { method, body, headers: {}, socket: { remoteAddress: "127.0.0.1" } }, res };
}

(async () => {
  const settings = { status: "configured", configured: true, provider: "zhipu", model: "glm-5.3", baseUrl: "https://open.bigmodel.cn/api/paas/v4" };
  const provider = {
    getProviderConfig: () => ({ summary: settings }),
    saveProviderConfig: (input) => { assert.equal(input.apiKey, "browser-secret"); return settings; },
    testProviderConnection: async () => ({ ok: true, provider: "zhipu", model: "glm-5.3" }),
  };
  let actorRole = "super_admin";
  const authSession = { requireUser(_req, res, roles) {
    if (!actorRole) { res.status(401).json({ error: "请先登录", code: "AUTH_REQUIRED" }); return null; }
    if (!roles.includes(actorRole)) { res.status(403).json({ error: "无权限", code: "FORBIDDEN" }); return null; }
    return { role: actorRole };
  } };
  const handler = loadHandler("pages/api/admin/settings.js", authSession, provider);
  const testHandler = loadHandler("pages/api/admin/settings/test.js", authSession, provider);
  let status = 0;
  let payload;
  const res = { status(value) { status = value; return this; }, json(value) { payload = value; }, setHeader() {} };
  actorRole = null;
  await handler({ method: "GET", headers: {}, socket: { remoteAddress: "127.0.0.1" } }, res);
  assert.equal(status, 401, "未登录必须拒绝读取服务配置");
  actorRole = "operator";
  await handler({ method: "GET", headers: {}, socket: { remoteAddress: "127.0.0.1" } }, res);
  assert.equal(status, 403, "运营账号不得读取服务配置");
  actorRole = "super_admin";
  await handler({ method: "GET", headers: {}, socket: { remoteAddress: "127.0.0.1" } }, res);
  assert.equal(status, 200);
  assert.equal(payload.status, settings.status);
  assert.equal(payload.configured, settings.configured);
  assert.equal(payload.provider, settings.provider);
  assert.equal(payload.model, settings.model);
  assert.equal(payload.baseUrl, settings.baseUrl);
  assert.equal(JSON.stringify(payload).includes("apiKey"), false);

  status = 0; payload = undefined;
  await handler({ method: "POST", body: { apiKey: "browser-secret", model: "glm-5.3", baseUrl: settings.baseUrl }, headers: {}, socket: { remoteAddress: "127.0.0.1" } }, res);
  assert.equal(status, 200);
  assert.equal(JSON.stringify(payload).includes("browser-secret"), false);

  status = 0; payload = undefined;
  await handler({ method: "POST", body: {}, headers: {}, socket: { remoteAddress: "127.0.0.1" } }, res);
  assert.equal(status, 400);

  status = 0; payload = undefined;
  await testHandler({ method: "POST", body: {}, headers: {}, socket: { remoteAddress: "127.0.0.1" } }, res);
  assert.equal(status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.provider, "zhipu");
  assert.equal(payload.model, "glm-5.3");
  assert.equal(typeof payload.testedAt, "string");
  assert.equal(payload.note, "真实测试调用成功；没有保存测试内容");
  assert.equal(JSON.stringify(payload).includes("browser-secret"), false);

  const failingTestHandler = loadHandler("pages/api/admin/settings/test.js", authSession, {
    testProviderConnection: async () => { throw Object.assign(new Error("ZHIPU_REQUEST_FAILED"), { code: "ZHIPU_REQUEST_FAILED", upstreamStatus: 429, payload: { error: { code: "1113", message: "当前模型不支持该请求参数" } } }); },
  });
  status = 0; payload = undefined;
  await failingTestHandler({ method: "POST", body: {}, headers: {}, socket: { remoteAddress: "127.0.0.1" } }, res);
  assert.equal(status, 502);
  assert.equal(payload.error, "智谱上游拒绝了请求；这不等于账户欠费，请核对 API Key 类型、接口端点、模型权限和请求参数");
  assert.equal(payload.code, "ZHIPU_REQUEST_FAILED");
  assert.equal(payload.diagnostics.upstreamStatus, 429);
  assert.equal(payload.diagnostics.upstreamCode, "1113");

  console.log("test-admin-settings-api: route contract passed");
})().catch((error) => { console.error(error); process.exit(1); });
