const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-reply-history-api-"));
process.env.AUTH_DB_PATH = path.join(root, "auth.sqlite");
const authSession = require("./lib/auth-session.cjs");
const store = authSession.getAuthStore();
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
const operator = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password" });
store.approveOperator({ operatorId: operator.id, approvedBy: admin.id });
const anchor = store.createAnchor({ operatorId: operator.id, phone: "13700137000", name: "主播一号", password: "anchor-password" });
const brother = store.createChatBrother({ actor: anchor, clientId: "history-api", nickname: "山哥" });
store.appendChatMessage({ actor: anchor, brotherId: brother.id, message: { id: "m-1", sender: "brother", source: "paste", status: "confirmed", text: "今天还好吗" } });

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
  const api = loadHandler("pages/api/chat/reply-history.js");
  const anchorCookie = `hh_session=${store.createSession({ userId: anchor.id }).token}`;
  const saved = await call(api, { method: "POST", cookie: anchorCookie, body: { brotherId: brother.id, sourceMessageId: "m-1", currentMessage: "今天还好吗", replyStyle: "warm", replies: [{ text: "看到你就放心了" }] } });
  assert.equal(saved.status, 201);
  assert.equal(saved.headers["Cache-Control"], "private, no-store, max-age=0");
  const listed = await call(api, { cookie: anchorCookie, query: { brotherId: brother.id } });
  assert.equal(listed.status, 200);
  assert.equal(listed.payload.items[0].replies[0].text, "看到你就放心了");
  const invalid = await call(api, { method: "POST", cookie: anchorCookie, body: { brotherId: brother.id, replies: [] } });
  assert.equal(invalid.status, 400);
  const method = await call(api, { method: "PATCH", cookie: anchorCookie, body: { brotherId: brother.id } });
  assert.equal(method.status, 405);
  store.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log("test-chat-reply-history-api: ok");
})().catch((error) => { console.error(error); try { store.close(); } catch {} fs.rmSync(root, { recursive: true, force: true }); process.exit(1); });
