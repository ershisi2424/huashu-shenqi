const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-maintenance-task-api-"));
process.env.AUTH_DB_PATH = path.join(root, "auth.sqlite");
const authSession = require("./lib/auth-session.cjs");
const store = authSession.getAuthStore();
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
const operator = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password" });
store.approveOperator({ operatorId: operator.id, approvedBy: admin.id });
const anchor = store.createAnchor({ operatorId: operator.id, phone: "13700137000", name: "主播一号", password: "anchor-password" });
const brother = store.createChatBrother({ actor: anchor, clientId: "bro_api_task", nickname: "山哥" });
store.appendChatMessage({ actor: anchor, brotherId: brother.id, message: { id: "msg_api_task", sender: "brother", source: "paste", status: "confirmed", text: "晚上好" } });

function loadHandler(relativePath) {
  const source = fs.readFileSync(path.join(__dirname, relativePath), "utf8")
    .replace(/^import \{([^}]+)\} from .*auth-session\.cjs.*$/m, "const {$1} = authSession;")
    .replace(/^export default async function handler/m, "async function handler");
  const context = { console, JSON, String, Number, Date, process, authSession };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.handler = handler;`, context);
  return context.handler;
}

const tasks = loadHandler("pages/api/chat/tasks.js");
async function call(handler, { method = "GET", body = {}, cookie = "", query = {} } = {}) {
  let status = 200;
  let payload;
  const headers = {};
  const req = { method, body, query, headers: { cookie }, socket: { remoteAddress: "127.0.0.1" } };
  const res = { setHeader(name, value) { headers[name] = value; }, status(value) { status = value; return this; }, json(value) { payload = value; return this; }, end() { payload = null; return this; } };
  await handler(req, res);
  return { status, payload, headers };
}

(async () => {
  const anchorSession = store.createSession({ userId: anchor.id });
  const anchorCookie = `hh_session=${anchorSession.token}`;
  const operatorSession = store.createSession({ userId: operator.id });
  const operatorCookie = `hh_session=${operatorSession.token}`;
  const listed = await call(tasks, { cookie: anchorCookie, query: { brotherId: brother.id } });
  assert.equal(listed.status, 200);
  assert.equal(listed.payload.items.length, 1);
  const updated = await call(tasks, { method: "PATCH", cookie: anchorCookie, body: { taskId: listed.payload.items[0].id, status: "snoozed", nextAction: "下班后再问候" } });
  assert.equal(updated.status, 200);
  assert.equal(updated.payload.item.status, "snoozed");
  const readOnly = await call(tasks, { method: "PATCH", cookie: operatorCookie, body: { taskId: listed.payload.items[0].id, status: "done" } });
  assert.equal(readOnly.status, 403);
  const created = await call(tasks, { method: "POST", cookie: anchorCookie, body: { brotherId: brother.id, title: "人工跟进", reason: "今晚再问候", nextAction: "明晚关注状态", priority: "high", requestId: "api-retry-1" } });
  assert.equal(created.status, 201);
  assert.equal(created.payload.item.status, "follow_up");
  assert.equal(created.payload.item.sourceMessageId, null);
  assert.equal(created.payload.item.requestId, "api-retry-1");
  const repeated = await call(tasks, { method: "POST", cookie: anchorCookie, body: { brotherId: brother.id, title: "重复提交", requestId: "api-retry-1" } });
  assert.equal(repeated.status, 201);
  assert.equal(repeated.payload.item.id, created.payload.item.id);
  const missingTitle = await call(tasks, { method: "POST", cookie: anchorCookie, body: { brotherId: brother.id } });
  assert.equal(missingTitle.status, 400);
  assert.equal(missingTitle.payload.code, "TASK_TITLE_REQUIRED");
  const missingBrother = await call(tasks, { method: "POST", cookie: anchorCookie, body: { title: "缺少对象" } });
  assert.equal(missingBrother.status, 400);
  assert.equal(missingBrother.payload.code, "TASK_BROTHER_REQUIRED");
  const forbiddenCreate = await call(tasks, { method: "POST", cookie: operatorCookie, body: { brotherId: brother.id, title: "运营建议" } });
  assert.equal(forbiddenCreate.status, 201, "所属运营可以创建人工任务");
  const method = await call(tasks, { method: "PUT", cookie: anchorCookie });
  assert.equal(method.status, 405);
  assert.match(method.headers.Allow, /POST/);
  store.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log("test-maintenance-task-api: ok");
})().catch((error) => { console.error(error); process.exit(1); });
