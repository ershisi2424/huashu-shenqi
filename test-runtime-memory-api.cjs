/* eslint-disable */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "goutou-runtime-memory-api-"));
process.env.AUTH_DB_PATH = path.join(root, "auth.sqlite");
const authSession = require("./lib/auth-session.cjs");
const store = authSession.getAuthStore();
const admin = store.ensureBootstrapAdmin({ phone: "13810000001", name: "最高权限", password: "admin-password" });
const operatorPending = store.registerOperator({ phone: "13910000001", name: "运营一号", password: "operator-password" });
const operator = store.approveOperator({ operatorId: operatorPending.id, approvedBy: admin.id });
const otherOperatorPending = store.registerOperator({ phone: "13910000002", name: "运营二号", password: "operator-password" });
const otherOperator = store.approveOperator({ operatorId: otherOperatorPending.id, approvedBy: admin.id });
const anchor = store.createAnchor({ operatorId: operator.id, phone: "13710000001", name: "主播一号", password: "anchor-password" });
const otherAnchor = store.createAnchor({ operatorId: otherOperator.id, phone: "13710000002", name: "主播二号", password: "anchor-password" });
const brother = store.createChatBrother({ actor: anchor, clientId: "runtime-api-brother", nickname: "山哥" });

function loadHandler(relativePath) {
  const source = fs.readFileSync(path.join(__dirname, relativePath), "utf8")
    .replace(/^import \{([^}]+)\} from .*auth-session\.cjs.*$/m, "const {$1} = authSession;")
    .replace(/^import \{([^}]+)\} from .*runtime\/memory\.js.*$/m, "const {$1} = memory;")
    .replace(/^export default async function handler/m, "async function handler");
  const context = {
    console,
    JSON,
    String,
    Number,
    Date,
    process,
    authSession,
    memory: {
      normalizeMemoryCommand(value) {
        const allowed = new Set(["status", "enable", "pause", "resume", "apply", "undo", "forget-object", "revoke", "clear"]);
        return {
          action: allowed.has(value?.action) ? value.action : "status",
          brotherId: typeof value?.brotherId === "string" ? value.brotherId.trim().slice(0, 120) : "",
          consent: value?.consent === true,
          delta: value?.delta && typeof value.delta === "object" ? value.delta : null,
        };
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.handler = handler;`, context);
  return context.handler;
}

async function call(handler, { method = "GET", body = {}, cookie = "", query = {} } = {}) {
  let status = 200;
  let payload;
  const headers = {};
  const req = { method, body, query, headers: { cookie }, socket: { remoteAddress: "127.0.0.1" } };
  const res = { setHeader(name, value) { headers[name] = value; }, status(value) { status = value; return this; }, json(value) { payload = value; return this; } };
  await handler(req, res);
  return { status, payload, headers };
}

(async () => {
  const handler = loadHandler("pages/api/chat/runtime-memory.js");
  const anchorCookie = `hh_session=${store.createSession({ userId: anchor.id }).token}`;
  const operatorCookie = `hh_session=${store.createSession({ userId: operator.id }).token}`;
  const otherAnchorCookie = `hh_session=${store.createSession({ userId: otherAnchor.id }).token}`;
  assert.equal((await call(handler, { query: { brotherId: brother.id } })).status, 401);
  const initial = await call(handler, { cookie: anchorCookie, query: { brotherId: brother.id } });
  assert.equal(initial.status, 200);
  assert.equal(initial.payload.status.consentEnabled, false);
  assert.equal((await call(handler, { cookie: operatorCookie, query: { brotherId: brother.id } })).status, 200);
  assert.equal((await call(handler, { method: "POST", cookie: anchorCookie, body: { action: "enable", brotherId: brother.id } })).status, 200);
  assert.equal((await call(handler, { method: "POST", cookie: operatorCookie, body: { action: "pause", brotherId: brother.id } })).status, 403);
  const applied = await call(handler, { method: "POST", cookie: anchorCookie, body: { action: "apply", brotherId: brother.id, delta: { scope: "object", field: "interest", value: "户外", sourceType: "user_explicit", confidence: "high" } } });
  assert.equal(applied.status, 201);
  assert.equal(applied.payload.item.value, "户外");
  assert.equal((await call(handler, { cookie: otherAnchorCookie, query: { brotherId: brother.id } })).status, 403);
  store.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log("✅ runtime memory API contract passed");
})().catch((error) => { try { store.close(); } catch {} fs.rmSync(root, { recursive: true, force: true }); console.error(error); process.exit(1); });
