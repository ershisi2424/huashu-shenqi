const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-server-chat-api-"));
process.env.AUTH_DB_PATH = path.join(root, "auth.sqlite");
const authSession = require("./lib/auth-session.cjs");
const store = authSession.getAuthStore();
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
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

const brothers = loadHandler("pages/api/chat/brothers.js");
const messages = loadHandler("pages/api/chat/messages.js");
const overview = loadHandler("pages/api/ops/overview.js");
const anchors = loadHandler("pages/api/auth/anchors.js");
const workspaceSnapshots = loadHandler("pages/api/chat/workspace-snapshots.js");

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
  const anchorSession = store.createSession({ userId: anchor.id });
  const anchorCookie = `hh_session=${anchorSession.token}`;
  const operatorSession = store.createSession({ userId: operator.id });
  const operatorCookie = `hh_session=${operatorSession.token}`;
  const adminSession = store.createSession({ userId: admin.id });
  const adminCookie = `hh_session=${adminSession.token}`;

  const created = await call(brothers, { method: "POST", cookie: anchorCookie, body: { clientId: "bro_local_1", nickname: "山哥" } });
  assert.equal(created.status, 201);
  const brotherId = created.payload.item.id;
  const added = await call(messages, { method: "POST", cookie: anchorCookie, body: { brotherId, message: { id: "msg_api_1", sender: "brother", source: "paste", status: "confirmed", text: "晚上好" } } });
  assert.equal(added.status, 201);
  const edited = await call(messages, { method: "PATCH", cookie: anchorCookie, body: { brotherId, messageId: "msg_api_1", text: "晚上好（已修正）" } });
  assert.equal(edited.status, 200);
  assert.equal(edited.payload.item.text, "晚上好（已修正）");
  const sentAdded = await call(messages, { method: "POST", cookie: anchorCookie, body: { brotherId, message: { id: "msg_api_sent", sender: "anchor", source: "manual", status: "sent", text: "已发送原文", createdAt: "2026-09-30T08:01:00.000Z", sentAt: "2026-09-30T08:01:00.000Z" } } });
  assert.equal(sentAdded.status, 201);
  const sentEdited = await call(messages, { method: "PATCH", cookie: anchorCookie, body: { brotherId, messageId: "msg_api_sent", text: "已发送修正文" } });
  assert.equal(sentEdited.status, 200);
  assert.equal(sentEdited.payload.item.status, "sent");
  assert.equal(sentEdited.payload.item.sentAt, "2026-09-30T08:01:00.000Z");
  const operatorWrite = await call(messages, { method: "POST", cookie: operatorCookie, body: { brotherId, message: { id: "msg_operator_write", sender: "anchor", source: "manual", status: "sent", text: "运营不应代主播写入" } } });
  assert.equal(operatorWrite.status, 403, "运营界面只能只读查看主播聊天");
  const operatorEdit = await call(messages, { method: "PATCH", cookie: operatorCookie, body: { brotherId, messageId: "msg_api_1", text: "运营不应修改主播聊天" } });
  assert.equal(operatorEdit.status, 403, "运营界面只能只读修改主播聊天");
  const adminWrite = await call(messages, { method: "POST", cookie: adminCookie, body: { brotherId, message: { id: "msg_admin_write", sender: "anchor", source: "manual", status: "sent", text: "管理不应代主播写入" } } });
  assert.equal(adminWrite.status, 403, "最高管理界面只能只读查看主播聊天");
  const listed = await call(messages, { method: "GET", cookie: operatorCookie, query: { brotherId } });
  assert.equal(listed.status, 200);
  assert.equal(listed.payload.items.find((item) => item.id === "msg_api_1").text, "晚上好（已修正）");
  assert.equal(listed.payload.items.find((item) => item.id === "msg_api_sent").text, "已发送修正文");
  const snapshotSaved = await call(workspaceSnapshots, { method: "POST", cookie: anchorCookie, body: {
    brotherId,
    snapshot: { latestDraft: "晚安", profileSources: { works: "钓鱼视频", comments: "周末去钓鱼", statements: "最近工作忙" }, replies: [] },
  } });
  assert.equal(snapshotSaved.status, 201);
  assert.deepEqual(snapshotSaved.payload.item.profileSources, { works: "钓鱼视频", comments: "周末去钓鱼", statements: "最近工作忙" });
  const denied = await call(overview, { method: "GET", cookie: anchorCookie });
  assert.equal(denied.status, 403);
  const operatorView = await call(overview, { method: "GET", cookie: operatorCookie });
  assert.equal(operatorView.status, 200);
  assert.equal(operatorView.payload.anchors[0].messageCount, 2);
  const adminView = await call(overview, { method: "GET", cookie: adminCookie });
  assert.equal(adminView.status, 200);
  assert.equal(adminView.payload.operators.length, 1);
  const newAnchor = await call(anchors, { method: "POST", cookie: operatorCookie, body: { phone: "13600136000", name: "主播二号", password: "anchor-password-2" } });
  assert.equal(newAnchor.status, 201);
  assert.equal(newAnchor.payload.user.role, "anchor");

  const operatorPersonal = await call(brothers, { method: "POST", cookie: operatorCookie, body: { clientId: "operator_personal", nickname: "运营自己的对象" } });
  assert.equal(operatorPersonal.status, 201, "运营应可创建个人聊天工作区对象");
  const operatorPersonalList = await call(brothers, { method: "GET", cookie: operatorCookie, query: { scope: "personal" } });
  assert.equal(operatorPersonalList.status, 200);
  assert.equal(operatorPersonalList.payload.items.some((item) => item.id === operatorPersonal.payload.item.id), true);
  assert.equal(operatorPersonalList.payload.items.some((item) => item.id === brotherId), false, "运营个人列表不能混入主播对象");
  const operatorPersonalMessage = await call(messages, { method: "POST", cookie: operatorCookie, body: { brotherId: operatorPersonal.payload.item.id, message: { id: "operator_personal_message", sender: "brother", source: "paste", status: "confirmed", text: "运营自己的消息" } } });
  assert.equal(operatorPersonalMessage.status, 201);
  const adminPersonal = await call(brothers, { method: "POST", cookie: adminCookie, body: { clientId: "admin_personal", nickname: "管理自己的对象" } });
  assert.equal(adminPersonal.status, 201, "最高管理应可创建个人聊天工作区对象");
  const adminPersonalList = await call(brothers, { method: "GET", cookie: adminCookie, query: { scope: "personal" } });
  assert.equal(adminPersonalList.payload.items.some((item) => item.id === adminPersonal.payload.item.id), true);
  assert.equal(adminPersonalList.payload.items.some((item) => item.id === brotherId), false, "最高管理个人列表不能混入主播对象");

  store.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log("test-server-chat-api: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
