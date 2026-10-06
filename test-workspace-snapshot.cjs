const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-workspace-snapshot-"));
process.env.AUTH_DB_PATH = path.join(root, "auth.sqlite");
const authSession = require("./lib/auth-session.cjs");
const store = authSession.getAuthStore();
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
const operator = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password" });
store.approveOperator({ operatorId: operator.id, approvedBy: admin.id });
const outsider = store.registerOperator({ phone: "13900139001", name: "运营二号", password: "operator-password-b" });
store.approveOperator({ operatorId: outsider.id, approvedBy: admin.id });
const anchor = store.createAnchor({ operatorId: operator.id, phone: "13700137000", name: "主播一号", password: "anchor-password" });
const otherAnchor = store.createAnchor({ operatorId: outsider.id, phone: "13700137001", name: "主播二号", password: "anchor-password-b" });
const brother = store.createChatBrother({ actor: anchor, clientId: "brother-a", nickname: "山哥" });
const anchorSession = store.createSession({ userId: anchor.id });
store.appendChatMessage({ actor: anchor, brotherId: brother.id, message: { id: "snapshot-source-1", sender: "brother", source: "paste", status: "confirmed", text: "第一条上下文" } });
store.appendChatMessage({ actor: anchor, brotherId: brother.id, message: { id: "snapshot-source-2", sender: "brother", source: "paste", status: "confirmed", text: "第二条上下文" } });

const first = store.saveWorkspaceSnapshot({ actor: anchor, brotherId: brother.id, snapshot: { sourceMessageId: "snapshot-source-1", latestDraft: "第一版", replies: [{ style: "温柔", text: "先忙你的，晚点聊" }], profile: { summary: "信息有限" } } });
assert.equal(first.latestDraft, "第一版");
const second = store.saveWorkspaceSnapshot({ actor: anchor, brotherId: brother.id, snapshot: { sourceMessageId: "snapshot-source-2", latestDraft: "最新草稿", replies: [{ style: "轻松", text: "今天也辛苦啦" }, { style: "克制", text: "你忙完再说" }], profile: { summary: "偏好轻松聊天" }, coreDecision: { action: "陪伴" } } });
assert.equal(second.latestDraft, "最新草稿");
assert.equal(second.replies.length, 2);
assert.equal(store.listWorkspaceSnapshots({ actor: operator, brotherId: brother.id }).length, 1, "每个维护对象只保留最新快照");
assert.equal(store.listWorkspaceSnapshots({ actor: operator, brotherId: brother.id })[0].replies[0].text, "今天也辛苦啦");
assert.throws(() => store.saveWorkspaceSnapshot({ actor: operator, brotherId: brother.id, snapshot: { latestDraft: "运营不应写入" } }), /WORKSPACE_WRITE_DENIED/);
const readonly = store.listReadonlyWorkspace({ actor: operator, anchorId: anchor.id });
assert.equal(readonly.anchor.phone, "137****00");
assert.equal(readonly.brothers[0].workspace.latestDraft, "最新草稿");
assert.equal(readonly.brothers[0].workspace.replies.length, 2);
assert.throws(() => store.listReadonlyWorkspace({ actor: outsider, anchorId: anchor.id }), /WORKSPACE_READ_DENIED/);
assert.throws(() => store.listReadonlyWorkspace({ actor: anchor, anchorId: anchor.id }), /WORKSPACE_READ_DENIED/);
assert.ok(store.getSessionUser(anchorSession.token));
assert.ok(otherAnchor.id);

function loadHandler(relativePath) {
  const source = fs.readFileSync(path.join(__dirname, relativePath), "utf8")
    .replace(/^import \{([^}]+)\} from .*auth-session\.cjs.*$/m, "const {$1} = authSession;")
    .replace(/^export default async function handler/m, "async function handler");
  const context = { console, JSON, String, Number, Date, process, authSession };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.handler = handler;`, context);
  return context.handler;
}

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
  const api = loadHandler("pages/api/chat/workspace-snapshots.js");
  const anchorCookie = `hh_session=${anchorSession.token}`;
  const operatorCookie = `hh_session=${store.createSession({ userId: operator.id }).token}`;
  const adminCookie = `hh_session=${store.createSession({ userId: admin.id }).token}`;
  const anchorRead = await call(api, { cookie: anchorCookie, query: { brotherId: brother.id } });
  assert.equal(anchorRead.status, 200);
  const adminRead = await call(api, { cookie: adminCookie, query: { anchorId: anchor.id } });
  assert.equal(adminRead.status, 200);
  assert.equal(adminRead.payload.brothers[0].workspace.latestDraft, "最新草稿");
  const operatorRead = await call(api, { cookie: operatorCookie, query: { anchorId: anchor.id } });
  assert.equal(operatorRead.status, 200);
  const denied = await call(api, { method: "POST", cookie: operatorCookie, body: { brotherId: brother.id, snapshot: { latestDraft: "不允许" } } });
  assert.equal(denied.status, 403);
  const saved = await call(api, { method: "POST", cookie: anchorCookie, body: { brotherId: brother.id, snapshot: { sourceMessageId: "snapshot-source-2", latestDraft: "API 最新", replies: [{ text: "收到" }] } } });
  assert.equal(saved.status, 201);
  assert.equal(saved.payload.item.latestDraft, "API 最新");

  store.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log("test-workspace-snapshot: ok");
})().catch((error) => {
  console.error(error);
  try { store.close(); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
  process.exit(1);
});
