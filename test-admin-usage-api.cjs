const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-admin-usage-api-"));
process.env.AUTH_DB_PATH = path.join(root, "auth.sqlite");
const authSession = require("./lib/auth-session.cjs");
const store = authSession.getAuthStore();
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
const operator = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password" });
store.approveOperator({ operatorId: operator.id, approvedBy: admin.id });
const anchor = store.createAnchor({ operatorId: operator.id, phone: "13700137000", name: "主播一号", password: "anchor-password" });
const brother = store.createChatBrother({ actor: anchor, clientId: "usage-api-brother", nickname: "山哥" });
store.recordAiUsage({ actor: anchor, brotherId: brother.id, operation: "profile.generate", provider: "zhipu", model: "GLM-5.3", status: "success", latencyMs: 42 });

const source = fs.readFileSync(path.join(__dirname, "pages/api/admin/usage.js"), "utf8")
  .replace(/^import \{([^}]+)\} from .*auth-session\.cjs.*$/m, "const {$1} = authSession;")
  .replace(/^export default async function handler/m, "async function handler");
const context = { console, JSON, String, Number, Date, URLSearchParams, process, authSession };
vm.createContext(context);
vm.runInContext(`${source}\nglobalThis.handler = handler;`, context);

async function call(cookie) {
  let status = 200;
  let payload;
  const req = { method: "GET", query: {}, headers: { cookie }, socket: { remoteAddress: "127.0.0.1" } };
  const res = { setHeader() {}, status(value) { status = value; return this; }, json(value) { payload = value; return this; } };
  await context.handler(req, res);
  return { status, payload };
}

(async () => {
  const adminSession = store.createSession({ userId: admin.id });
  const operatorSession = store.createSession({ userId: operator.id });
  const adminResult = await call(`hh_session=${adminSession.token}`);
  assert.equal(adminResult.status, 200);
  assert.equal(adminResult.payload.summary.total, 1);
  assert.equal(adminResult.payload.items[0].model, "GLM-5.3");
  const operatorResult = await call(`hh_session=${operatorSession.token}`);
  assert.equal(operatorResult.status, 403);
  store.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log("test-admin-usage-api: ok");
})().catch((error) => { console.error(error); process.exit(1); });
