const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-chat-enhancements-api-"));
process.env.AUTH_DB_PATH = path.join(root, "auth.sqlite");
const authSession = require("./lib/auth-session.cjs");
const store = authSession.getAuthStore();
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
const operator = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password" });
store.approveOperator({ operatorId: operator.id, approvedBy: admin.id });
const anchor = store.createAnchor({ operatorId: operator.id, phone: "13700137000", name: "主播一号", password: "anchor-password" });
const brother = store.createChatBrother({ actor: anchor, clientId: "api_enhance_1", nickname: "山哥" });
const message = store.appendChatMessage({ actor: anchor, brotherId: brother.id, message: { id: "api_enhance_msg", sender: "brother", source: "paste", status: "confirmed", text: "今晚聊聊工作" } });

function loadHandler(relativePath) {
  const source = fs.readFileSync(path.join(__dirname, relativePath), "utf8")
    .replace(/^import \{([^}]+)\} from .*auth-session\.cjs.*$/m, "const {$1} = authSession;")
    .replace(/^export default async function handler/m, "async function handler");
  const context = { console, JSON, String, Number, Date, process, authSession };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.handler = handler;`, context);
  return context.handler;
}

const search = loadHandler("pages/api/chat/search.js");
const marks = loadHandler("pages/api/chat/marks.js");
const timeline = loadHandler("pages/api/chat/timeline.js");
const notes = loadHandler("pages/api/chat/notes.js");

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
  const found = await call(search, { cookie: anchorCookie, query: { q: "工作" } });
  assert.equal(found.status, 200);
  assert.equal(found.payload.items[0].messageId, message.id);

  const marked = await call(marks, { method: "PATCH", cookie: anchorCookie, body: { brotherId: brother.id, messageId: message.id, favorite: true, pinned: true } });
  assert.equal(marked.status, 200);
  assert.equal(marked.payload.item.favorite, true);

  const createdEvent = await call(timeline, { method: "POST", cookie: anchorCookie, body: { brotherId: brother.id, type: "note", title: "API 记录", body: "确认过的人工事件" } });
  assert.equal(createdEvent.status, 201);
  const listedEvents = await call(timeline, { cookie: anchorCookie, query: { brotherId: brother.id } });
  assert.equal(listedEvents.status, 200);
  assert.equal(listedEvents.payload.items.length, 1);

  const forbiddenNotes = await call(notes, { cookie: anchorCookie, query: { brotherId: brother.id } });
  assert.equal(forbiddenNotes.status, 403);
  const method = await call(search, { method: "POST", cookie: anchorCookie });
  assert.equal(method.status, 405);

  store.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log("test-chat-enhancements-api: ok");
})().catch((error) => { console.error(error); process.exit(1); });
