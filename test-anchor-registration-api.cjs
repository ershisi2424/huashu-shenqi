const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-anchor-api-"));
process.env.AUTH_DB_PATH = path.join(root, "auth.sqlite");
const authSession = require("./lib/auth-session.cjs");
const store = authSession.getAuthStore();
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
const operator = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password" });
store.approveOperator({ operatorId: operator.id, approvedBy: admin.id });

function loadHandler(relativePath) {
  const source = fs.readFileSync(path.join(__dirname, relativePath), "utf8")
    .replace(/^import \{([^}]+)\} from .*auth-session\.cjs.*$/m, "const {$1} = authSession;")
    .replace(/^export default async function handler/m, "async function handler");
  const context = { console, JSON, String, Number, Date, process, authSession };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.handler = handler;`, context);
  return context.handler;
}

const operators = loadHandler("pages/api/auth/operators.js");
const register = loadHandler("pages/api/auth/register.js");
const approvals = loadHandler("pages/api/auth/anchor-approvals.js");

async function call(handler, { method = "GET", body = {}, cookie = "", query = {} } = {}) {
  let status = 200;
  let payload;
  const headers = {};
  const req = { method, body, query, headers: { cookie }, socket: { remoteAddress: "127.0.0.1" } };
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
  const publicOptions = await call(operators);
  assert.equal(publicOptions.status, 200);
  assert.equal(publicOptions.payload.items.length, 1);
  assert.ok(publicOptions.payload.items[0].phone.includes("****"));

  const registered = await call(register, { method: "POST", body: { role: "anchor", operatorId: operator.id, phone: "13700137000", name: "主播一号", password: "anchor-password" } });
  assert.equal(registered.status, 201);
  assert.equal(registered.payload.user.status, "pending");
  assert.equal(registered.payload.user.operatorId, operator.id);

  const pendingLogin = await call(loadHandler("pages/api/auth/login.js"), { method: "POST", body: { phone: "13700137000", password: "anchor-password" } });
  assert.equal(pendingLogin.status, 403);
  assert.equal(pendingLogin.payload.code, "ACCOUNT_PENDING");

  const operatorSession = store.createSession({ userId: operator.id });
  const operatorCookie = `hh_session=${operatorSession.token}`;
  const list = await call(approvals, { cookie: operatorCookie });
  assert.equal(list.status, 200);
  assert.equal(list.payload.items.length, 1);
  const approved = await call(approvals, { method: "POST", cookie: operatorCookie, body: { action: "approve", userId: registered.payload.user.id } });
  assert.equal(approved.status, 200);
  assert.equal(approved.payload.user.status, "active");

  store.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log("test-anchor-registration-api: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
