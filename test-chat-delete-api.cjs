const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-chat-delete-api-"));
process.env.AUTH_DB_PATH = path.join(root, "auth.sqlite");
const authSession = require("./lib/auth-session.cjs");
const store = authSession.getAuthStore();
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
const operator = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password" });
store.approveOperator({ operatorId: operator.id, approvedBy: admin.id });
const anchor = store.createAnchor({ operatorId: operator.id, phone: "13700137000", name: "主播一号", password: "anchor-password" });
const otherAnchor = store.createAnchor({ operatorId: operator.id, phone: "13700137001", name: "主播二号", password: "anchor-password-2" });
const brother = store.createChatBrother({ actor: anchor, clientId: "delete_api_1", nickname: "山哥" });
const otherBrother = store.createChatBrother({ actor: otherAnchor, clientId: "delete_api_2", nickname: "山哥" });
const message = store.appendChatMessage({ actor: anchor, brotherId: brother.id, message: { id: "delete_api_msg", sender: "brother", source: "paste", status: "confirmed", text: "待删除的消息" } });
store.saveWorkspaceSnapshot({ actor: anchor, brotherId: brother.id, snapshot: { sourceMessageId: message.id, latestDraft: "候选草稿", replies: [{ style: "自然", text: "候选回复", rationale: "承接" }] } });
store.saveReplyHistory({ actor: anchor, brotherId: brother.id, sourceMessageId: message.id, currentMessage: message.text, replies: [{ style: "自然", text: "候选回复", rationale: "承接" }] });
store.createRelationshipEvent({ actor: anchor, brotherId: brother.id, type: "note", title: "待删除对象事件" });

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
  const res = { setHeader(name, value) { headers[name] = value; }, status(value) { status = value; return this; }, json(value) { payload = value; return this; }, end() { payload = null; return this; } };
  await handler(req, res);
  return { status, payload, headers };
}

(async () => {
  const anchorCookie = `hh_session=${store.createSession({ userId: anchor.id }).token}`;
  const otherAnchorCookie = `hh_session=${store.createSession({ userId: otherAnchor.id }).token}`;
  const operatorCookie = `hh_session=${store.createSession({ userId: operator.id }).token}`;
  const messages = loadHandler("pages/api/chat/messages.js");
  const brothers = loadHandler("pages/api/chat/brothers.js");

  assert.equal((await call(brothers, { method: "DELETE", cookie: anchorCookie, body: { brotherId: otherBrother.id } })).status, 403);
  const deletedMessage = await call(messages, { method: "DELETE", cookie: anchorCookie, body: { brotherId: brother.id, messageId: message.id } });
  assert.equal(deletedMessage.status, 200);
  assert.equal(deletedMessage.payload.item.id, message.id);
  assert.equal(store.listChatMessages({ actor: anchor, brotherId: brother.id }).length, 0);
  assert.equal((await call(messages, { method: "DELETE", cookie: otherAnchorCookie, body: { brotherId: brother.id, messageId: message.id } })).status, 403);
  assert.equal((await call(messages, { method: "DELETE", cookie: operatorCookie, body: { brotherId: otherBrother.id, messageId: "missing" } })).status, 403);

  const deletedBrother = await call(brothers, { method: "DELETE", cookie: anchorCookie, body: { brotherId: brother.id } });
  assert.equal(deletedBrother.status, 200);
  assert.equal(deletedBrother.payload.item.id, brother.id);
  assert.equal(store.listChatBrothers({ actor: anchor }).find((item) => item.id === brother.id), undefined);
  assert.throws(() => store.listWorkspaceSnapshots({ actor: anchor, brotherId: brother.id }), /CHAT_BROTHER_NOT_FOUND/);
  assert.throws(() => store.listReplyHistory({ actor: anchor, brotherId: brother.id }), /CHAT_BROTHER_NOT_FOUND/);
  assert.equal((await call(brothers, { method: "DELETE", cookie: operatorCookie, body: { brotherId: otherBrother.id } })).status, 403);

  store.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log("test-chat-delete-api: ok");
})().catch((error) => { console.error(error); process.exit(1); });
