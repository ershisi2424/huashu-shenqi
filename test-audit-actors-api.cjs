const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-audit-actors-api-"));
process.env.AUTH_DB_PATH = path.join(root, "auth.sqlite");
const authSession = require("./lib/auth-session.cjs");
const store = authSession.getAuthStore();
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "超级管理员", password: "admin-password" });
const operatorA = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password-a" });
store.approveOperator({ operatorId: operatorA.id, approvedBy: admin.id });
const operatorB = store.registerOperator({ phone: "13900139001", name: "运营二号", password: "operator-password-b" });
store.approveOperator({ operatorId: operatorB.id, approvedBy: admin.id });
const anchorA = store.createAnchor({ operatorId: operatorA.id, phone: "13700137000", name: "主播一号", password: "anchor-password-a" });
const anchorB = store.createAnchor({ operatorId: operatorB.id, phone: "13700137001", name: "主播二号", password: "anchor-password-b" });
const brotherA = store.createChatBrother({ actor: anchorA, clientId: "bro_a", nickname: "山哥" });
store.appendChatMessage({ actor: anchorA, brotherId: brotherA.id, message: { id: "msg_a", sender: "brother", source: "paste", status: "confirmed", text: "运营一号可见正文" } });
const brotherB = store.createChatBrother({ actor: anchorB, clientId: "bro_b", nickname: "海哥" });
store.appendChatMessage({ actor: anchorB, brotherId: brotherB.id, message: { id: "msg_b", sender: "anchor", source: "manual", status: "sent", text: "运营二号正文" } });

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
  const actors = loadHandler("pages/api/ops/audit/actors.js");
  const detail = loadHandler("pages/api/ops/audit/actor/[actorId].js");
  const adminCookie = `hh_session=${store.createSession({ userId: admin.id }).token}`;
  const operatorCookie = `hh_session=${store.createSession({ userId: operatorA.id }).token}`;
  const anchorCookie = `hh_session=${store.createSession({ userId: anchorA.id }).token}`;

  const adminView = await call(actors, { cookie: adminCookie });
  assert.equal(adminView.status, 200);
  assert.ok(adminView.payload.items.some((item) => item.actor.id === operatorA.id));
  assert.ok(adminView.payload.items.some((item) => item.actor.id === anchorB.id));
  assert.ok(adminView.payload.items.every((item) => !item.actor.phone.includes("00139000")));
  assert.ok(adminView.payload.items.every((item) => item.eventCount > 0));

  const operatorView = await call(actors, { cookie: operatorCookie });
  assert.equal(operatorView.status, 200);
  assert.ok(operatorView.payload.items.some((item) => item.actor.id === anchorA.id));
  assert.ok(operatorView.payload.items.every((item) => item.actor.id !== anchorB.id));

  const anchorDetail = await call(detail, { cookie: operatorCookie, query: { actorId: anchorA.id, limit: "100" } });
  assert.equal(anchorDetail.status, 200);
  assert.ok(anchorDetail.payload.items.some((item) => item.chatMessage?.text === "运营一号可见正文"));
  const hiddenDetail = await call(detail, { cookie: operatorCookie, query: { actorId: anchorB.id } });
  assert.equal(hiddenDetail.status, 200);
  assert.equal(hiddenDetail.payload.items.length, 0);

  assert.equal((await call(actors, { cookie: anchorCookie })).status, 403);
  assert.equal((await call(actors)).status, 401);
  assert.equal((await call(actors, { cookie: operatorCookie, query: { role: "not-a-role" } })).status, 400);
  assert.equal((await call(detail, { cookie: operatorCookie, query: { actorId: anchorA.id }, method: "POST" })).status, 405);

  store.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log("test-audit-actors-api: ok");
})().catch((error) => {
  console.error(error);
  try { store.close(); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
  process.exit(1);
});
