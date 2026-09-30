const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-audit-api-"));
process.env.AUTH_DB_PATH = path.join(root, "auth.sqlite");
const authSession = require("./lib/auth-session.cjs");
const store = authSession.getAuthStore();
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
const operatorA = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password-a" });
store.approveOperator({ operatorId: operatorA.id, approvedBy: admin.id });
const operatorB = store.registerOperator({ phone: "13900139001", name: "运营二号", password: "operator-password-b" });
store.approveOperator({ operatorId: operatorB.id, approvedBy: admin.id });
const anchorA = store.createAnchor({ operatorId: operatorA.id, phone: "13700137000", name: "主播一号", password: "anchor-password-a" });
const anchorB = store.createAnchor({ operatorId: operatorB.id, phone: "13700137001", name: "主播二号", password: "anchor-password-b" });
const brotherA = store.createChatBrother({ actor: anchorA, clientId: "bro_a", nickname: "山哥" });
store.appendChatMessage({ actor: anchorA, brotherId: brotherA.id, message: { id: "msg_a", sender: "brother", source: "paste", status: "confirmed", text: "运营可见的正文" } });
const brotherB = store.createChatBrother({ actor: anchorB, clientId: "bro_b", nickname: "海哥" });
store.appendChatMessage({ actor: anchorB, brotherId: brotherB.id, message: { id: "msg_b", sender: "anchor", source: "manual", status: "sent", text: "其他运营不可见的正文" } });

function loadHandler(relativePath) {
  const source = fs.readFileSync(path.join(__dirname, relativePath), "utf8")
    .replace(/^import \{([^}]+)\} from .*auth-session\.cjs.*$/m, "const {$1} = authSession;")
    .replace(/^export default async function handler/m, "async function handler");
  const context = { console, JSON, String, Number, Date, process, authSession };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.handler = handler;`, context);
  return context.handler;
}

async function call(handler, { method = "GET", cookie = "", query = {} } = {}) {
  let status = 200;
  let payload;
  const headers = {};
  const req = { method, query, headers: { cookie }, socket: { remoteAddress: "127.0.0.1" } };
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
  const audit = loadHandler("pages/api/ops/audit.js");
  const adminCookie = `hh_session=${store.createSession({ userId: admin.id }).token}`;
  const operatorCookie = `hh_session=${store.createSession({ userId: operatorA.id }).token}`;
  const anchorCookie = `hh_session=${store.createSession({ userId: anchorA.id }).token}`;

  const adminView = await call(audit, { cookie: adminCookie, query: { limit: "100" } });
  assert.equal(adminView.status, 200);
  assert.ok(adminView.payload.items.some((item) => item.chatMessage?.text === "其他运营不可见的正文"));
  const operatorView = await call(audit, { cookie: operatorCookie, query: { limit: "100" } });
  assert.equal(operatorView.status, 200);
  assert.ok(operatorView.payload.items.some((item) => item.chatMessage?.text === "运营可见的正文"));
  assert.ok(operatorView.payload.items.every((item) => item.chatMessage?.text !== "其他运营不可见的正文"));
  assert.equal((await call(audit, { cookie: anchorCookie })).status, 403);
  assert.equal((await call(audit)).status, 401);
  assert.equal((await call(audit, { cookie: operatorCookie, query: { limit: "bad" } })).status, 400);

  store.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log("test-audit-api: ok");
})().catch((error) => {
  console.error(error);
  try { store.close(); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
  process.exit(1);
});
