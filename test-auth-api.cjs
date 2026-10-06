const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-auth-api-"));
process.env.AUTH_DB_PATH = path.join(root, "auth.sqlite");
process.env.AUTH_REQUIRED = "true";
const authSession = require("./lib/auth-session.cjs");
const admin = authSession.getAuthStore().ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });

function loadHandler(relativePath) {
  const source = fs.readFileSync(path.join(__dirname, relativePath), "utf8")
    .replace(/^import \{([^}]+)\} from .*auth-session\.cjs.*$/m, "const {$1} = authSession;")
    .replace(/^export default async function handler/m, "async function handler");
  const context = { console, JSON, String, Number, Date, process, authSession };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.handler = handler;`, context);
  return context.handler;
}

const register = loadHandler("pages/api/auth/register.js");
const login = loadHandler("pages/api/auth/login.js");
const logout = loadHandler("pages/api/auth/logout.js");
const me = loadHandler("pages/api/auth/me.js");
const approvals = loadHandler("pages/api/auth/approvals.js");

for (const endpoint of ["login", "register", "logout", "operators", "anchors"]) {
  const source = fs.readFileSync(path.join(__dirname, `pages/api/auth/${endpoint}.js`), "utf8");
  assert.match(source, /setPrivateNoStore/, `${endpoint} 必须设置 private no-store 响应头`);
}

async function call(handler, { method = "POST", body = {}, cookie = "" } = {}) {
  let status = 200;
  let payload;
  const headers = {};
  const req = { method, body, headers: { cookie }, socket: { remoteAddress: "127.0.0.1" } };
  const res = {
    setHeader(name, value) { headers[name] = value; },
    status(value) { status = value; return this; },
    json(value) { payload = value; return this; },
    end() { payload = null; return this; },
  };
  await handler(req, res);
  return { status, payload, headers };
}

(async () => {
  const registered = await call(register, { body: { phone: "13900139000", name: "运营一号", password: "operator-password" } });
  assert.equal(registered.status, 201);
  assert.equal(registered.payload.user.status, "pending");
  assert.equal("passwordHash" in registered.payload.user, false);

  const pendingLogin = await call(login, { body: { phone: "13900139000", password: "operator-password" } });
  assert.equal(pendingLogin.status, 403);
  assert.equal(pendingLogin.payload.code, "ACCOUNT_PENDING");

  const adminSession = authSession.getAuthStore().createSession({ userId: admin.id });
  const adminCookie = `hh_session=${adminSession.token}`;
  const pendingList = await call(approvals, { method: "GET", cookie: adminCookie });
  assert.equal(pendingList.status, 200);
  assert.equal(pendingList.payload.items.length, 1);

  const approved = await call(approvals, { body: { action: "approve", userId: registered.payload.user.id }, cookie: adminCookie });
  assert.equal(approved.status, 200);
  assert.equal(approved.payload.user.status, "active");

  const operatorLogin = await call(login, { body: { phone: "13900139000", password: "operator-password" } });
  assert.equal(operatorLogin.status, 200);
  assert.match(String(operatorLogin.headers["Set-Cookie"]), /hh_session=/);
  const operatorCookie = String(operatorLogin.headers["Set-Cookie"]).split(";")[0];
  const current = await call(me, { method: "GET", cookie: operatorCookie });
  assert.equal(current.status, 200);
  assert.equal(current.payload.user.role, "operator");

  const forbidden = await call(approvals, { method: "GET", cookie: operatorCookie });
  assert.equal(forbidden.status, 403);
  const loggedOut = await call(logout, { cookie: operatorCookie });
  assert.equal(loggedOut.status, 204);
  assert.match(String(loggedOut.headers["Set-Cookie"]), /Max-Age=0/);

  authSession.getAuthStore().close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log("test-auth-api: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
