const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-user-management-api-"));
process.env.AUTH_DB_PATH = path.join(root, "auth.sqlite");
const authSession = require("./lib/auth-session.cjs");
const store = authSession.getAuthStore();
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "超级管理员", password: "admin-password" });
const operator = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password" });
store.approveOperator({ operatorId: operator.id, approvedBy: admin.id });
const anchor = store.createAnchor({ operatorId: operator.id, phone: "13700137000", name: "主播一号", password: "anchor-password" });

function loadHandler(relativePath) {
  const source = fs.readFileSync(path.join(__dirname, relativePath), "utf8")
    .replace(/^import \{([^}]+)\} from .*auth-session\.cjs.*$/m, "const {$1} = authSession;")
    .replace(/^export default async function handler/m, "async function handler");
  const context = { console, JSON, String, Number, Date, process, authSession };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.handler = handler;`, context);
  return context.handler;
}

async function call(handler, { method = "GET", cookie = "", query = {}, body = {} } = {}) {
  let status = 200;
  let payload;
  const headers = {};
  const req = { method, query, body, headers: { cookie }, socket: { remoteAddress: "127.0.0.1" } };
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
  const users = loadHandler("pages/api/admin/users.js");
  const status = loadHandler("pages/api/admin/users/[userId]/status.js");
  const confirm = loadHandler("pages/api/admin/users/[userId]/delete-confirm.js");
  const remove = loadHandler("pages/api/admin/users/[userId].js");
  const adminCookie = `hh_session=${store.createSession({ userId: admin.id }).token}`;
  const operatorCookie = `hh_session=${store.createSession({ userId: operator.id }).token}`;
  const anchorSession = store.createSession({ userId: anchor.id });

  const userList = await call(users, { cookie: adminCookie });
  assert.equal(userList.status, 200);
  assert.equal(userList.payload.items.length, 3);
  assert.ok(userList.payload.items.some((item) => item.id === anchor.id));
  assert.ok(!JSON.stringify(userList.payload).includes("password"));
  assert.ok(!JSON.stringify(userList.payload).includes("13700137000"), "phone numbers are masked");
  assert.equal((await call(users, { cookie: operatorCookie })).status, 403);
  assert.equal((await call(users)).status, 401);

  const disable = await call(status, { method: "POST", cookie: adminCookie, query: { userId: anchor.id }, body: { status: "disabled" } });
  assert.equal(disable.status, 200);
  assert.equal(disable.payload.user.status, "disabled");
  assert.equal(store.getSessionUser(anchorSession.token), null);
  assert.equal((await call(status, { method: "POST", cookie: adminCookie, query: { userId: admin.id }, body: { status: "disabled" } })).status, 403);
  assert.equal((await call(status, { method: "POST", cookie: operatorCookie, query: { userId: anchor.id }, body: { status: "active" } })).status, 403);
  assert.equal((await call(status, { method: "POST", cookie: adminCookie, query: { userId: anchor.id }, body: { status: "invalid" } })).status, 400);
  assert.equal((await call(status, { method: "POST", cookie: adminCookie, query: { userId: anchor.id }, body: { status: "active" } })).status, 200);

  assert.equal((await call(remove, { method: "DELETE", cookie: adminCookie, query: { userId: anchor.id } })).status, 409, "direct DELETE without confirmation cannot proceed");
  const prepared = await call(confirm, { method: "POST", cookie: adminCookie, query: { userId: anchor.id } });
  assert.equal(prepared.status, 200);
  assert.ok(prepared.payload.token);
  assert.equal((await call(remove, { method: "DELETE", cookie: operatorCookie, query: { userId: anchor.id }, body: { confirmationToken: prepared.payload.token } })).status, 403);
  const deleted = await call(remove, { method: "DELETE", cookie: adminCookie, query: { userId: anchor.id }, body: { confirmationToken: prepared.payload.token } });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.payload.deletedUserId, anchor.id);
  assert.equal(store.getUser(anchor.id), null);
  assert.equal((await call(remove, { method: "DELETE", cookie: adminCookie, query: { userId: anchor.id }, body: { confirmationToken: prepared.payload.token } })).status, 409, "confirmation token is one-use");

  store.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log("test-user-management-api: ok");
})().catch((error) => {
  console.error(error);
  try { store.close(); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
  process.exit(1);
});
