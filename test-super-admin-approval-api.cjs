const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-super-approval-api-"));
process.env.AUTH_DB_PATH = path.join(root, "auth.sqlite");
const authSession = require("./lib/auth-session.cjs");
const store = authSession.getAuthStore();
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
const operatorA = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password" });
const operatorB = store.registerOperator({ phone: "13600136000", name: "运营二号", password: "operator-password-2" });
store.approveOperator({ operatorId: operatorA.id, approvedBy: admin.id });
store.approveOperator({ operatorId: operatorB.id, approvedBy: admin.id });
const pendingA = store.registerAnchorApplication({ operatorId: operatorA.id, phone: "13700137000", name: "主播一号", password: "anchor-password" });
const pendingB = store.registerAnchorApplication({ operatorId: operatorB.id, phone: "13500135000", name: "主播二号", password: "anchor-password-2" });

function loadHandler(relativePath) {
  const source = fs.readFileSync(path.join(__dirname, relativePath), "utf8")
    .replace(/^import \{([^}]+)\} from .*auth-session\.cjs.*$/m, "const {$1} = authSession;")
    .replace(/^export default async function handler/m, "async function handler");
  const context = { console, JSON, String, Number, Date, process, authSession };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.handler = handler;`, context);
  return context.handler;
}

const approvals = loadHandler("pages/api/auth/anchor-approvals.js");
async function call(handler, { method = "GET", body = {}, cookie = "" } = {}) {
  let status = 200;
  let payload;
  const headers = {};
  const req = { method, body, query: {}, headers: { cookie }, socket: { remoteAddress: "127.0.0.1" } };
  const res = { setHeader(name, value) { headers[name] = value; }, status(value) { status = value; return this; }, json(value) { payload = value; return this; }, end() { payload = null; return this; } };
  await handler(req, res);
  return { status, payload, headers };
}

(async () => {
  const adminSession = store.createSession({ userId: admin.id });
  const adminCookie = `hh_session=${adminSession.token}`;
  const operatorSession = store.createSession({ userId: operatorA.id });
  const operatorCookie = `hh_session=${operatorSession.token}`;
  const adminList = await call(approvals, { cookie: adminCookie });
  assert.equal(adminList.status, 200);
  assert.equal(adminList.payload.items.length, 2);
  const approved = await call(approvals, { method: "POST", cookie: adminCookie, body: { action: "approve", userId: pendingA.id } });
  assert.equal(approved.status, 200);
  assert.equal(approved.payload.user.status, "active");
  const operatorList = await call(approvals, { cookie: operatorCookie });
  assert.equal(operatorList.status, 200, "运营仍可查看自己的主播申请");
  assert.equal(operatorList.payload.items.length, 0);
  const operatorCrossApproval = await call(approvals, { method: "POST", cookie: operatorCookie, body: { action: "approve", userId: pendingB.id } });
  assert.equal(operatorCrossApproval.status, 403, "运营不能审批其他运营名下主播");
  store.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log("test-super-admin-approval-api: ok");
})().catch((error) => { console.error(error); process.exit(1); });
