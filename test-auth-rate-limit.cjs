const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const Database = require("better-sqlite3");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-auth-rate-limit-"));
process.env.AUTH_DB_PATH = path.join(root, "auth.sqlite");
process.env.AUTH_REQUIRED = "true";
process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "2";
process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS = "60000";
process.env.AUTH_REGISTER_RATE_LIMIT_MAX = "2";
process.env.AUTH_REGISTER_RATE_LIMIT_WINDOW_MS = "60000";
process.env.AUTH_GUEST_RATE_LIMIT_MAX = "2";
process.env.AUTH_GUEST_RATE_LIMIT_WINDOW_MS = "60000";
process.env.GUEST_PHONE_HMAC_SECRET = "rate-limit-test-secret";

const authSession = require("./lib/auth-session.cjs");

function loadHandler(relativePath) {
  const source = fs.readFileSync(path.join(__dirname, relativePath), "utf8")
    .replace(/^import \{([^}]+)\} from .*auth-session\.cjs.*$/m, "const {$1} = authSession;")
    .replace(/^export default async function handler/m, "async function handler");
  const context = { console, JSON, String, Number, Date, process, authSession };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.handler = handler;`, context);
  return context.handler;
}

const login = loadHandler("pages/api/auth/login.js");
const register = loadHandler("pages/api/auth/register.js");
const guestLogin = loadHandler("pages/api/auth/guest-login.js");

async function call(handler, { body = {}, remoteAddress = "198.51.100.20", headers = {} } = {}) {
  let status = 200;
  let payload;
  const responseHeaders = {};
  const req = { method: "POST", body, headers, socket: { remoteAddress } };
  const res = {
    setHeader(name, value) { responseHeaders[name] = value; },
    getHeader(name) { return responseHeaders[name]; },
    status(value) { status = value; return this; },
    json(value) { payload = value; return this; },
    end() { payload = null; return this; },
  };
  await handler(req, res);
  return { status, payload, headers: responseHeaders };
}

function assertLimited(response, label) {
  assert.equal(response.status, 429, `${label} 超出窗口后必须返回 429`);
  assert.equal(response.payload?.code, "AUTH_RATE_LIMIT", `${label} 必须使用统一认证限流错误码`);
  assert.ok(Number(response.headers["Retry-After"]) >= 1, `${label} 必须返回 Retry-After`);
  assert.doesNotMatch(JSON.stringify(response.payload), /13900139000|13900139001/, `${label} 限流响应不应回显手机号`);
}

(async () => {
  const loginBody = { phone: "13900139000", password: "wrong-password" };
  assert.equal((await call(login, { body: loginBody })).status, 401);
  assert.equal((await call(login, { body: loginBody })).status, 401);
  assertLimited(await call(login, { body: loginBody }), "登录");

  // Unless the deployment explicitly trusts a reverse proxy, a client must
  // not evade the source bucket by rotating a forged X-Forwarded-For value.
  const sourceHeaders = { "x-forwarded-for": "203.0.113.1" };
  assert.equal((await call(login, { body: { phone: "13900139007", password: "wrong-password" }, remoteAddress: "198.51.100.23", headers: sourceHeaders })).status, 401);
  assert.equal((await call(login, { body: { phone: "13900139008", password: "wrong-password" }, remoteAddress: "198.51.100.23", headers: { "x-forwarded-for": "203.0.113.2" } })).status, 401);
  assertLimited(await call(login, { body: { phone: "13900139009", password: "wrong-password" }, remoteAddress: "198.51.100.23", headers: { "x-forwarded-for": "203.0.113.3" } }), "未信任代理来源");

  const registerBody = { phone: "13900139001", name: "注册测试", password: "operator-password" };
  assert.equal((await call(register, { body: registerBody, remoteAddress: "198.51.100.21" })).status, 201);
  assert.equal((await call(register, { body: { ...registerBody, phone: "13900139002" }, remoteAddress: "198.51.100.21" })).status, 201);
  assertLimited(await call(register, { body: { ...registerBody, phone: "13900139003" }, remoteAddress: "198.51.100.21" }), "注册");

  assert.equal((await call(guestLogin, { body: { phone: "13900139004" }, remoteAddress: "198.51.100.22" })).status, 200);
  assert.equal((await call(guestLogin, { body: { phone: "13900139005" }, remoteAddress: "198.51.100.22" })).status, 200);
  assertLimited(await call(guestLogin, { body: { phone: "13900139006" }, remoteAddress: "198.51.100.22" }), "游客登录");

  const db = new Database(process.env.AUTH_DB_PATH);
  const bucketKeys = db.prepare("SELECT bucket_key FROM rate_limit_buckets").all().map((row) => row.bucket_key);
  assert.ok(bucketKeys.length >= 6, "登录、注册和游客登录应分别记录 IP/账号桶");
  for (const value of ["13900139000", "13900139001", "13900139004", "198.51.100.20"]) {
    assert.equal(bucketKeys.some((key) => key.includes(value)), false, "限流桶不得保存明文手机号或 IP");
  }
  db.close();
  authSession.getAuthStore().close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log("test-auth-rate-limit: ok");
})().catch((error) => {
  console.error(error);
  try { authSession.getAuthStore().close(); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
  process.exit(1);
});
