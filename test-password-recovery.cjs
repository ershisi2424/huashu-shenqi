const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");
const vm = require("node:vm");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-password-recovery-"));
const dbPath = path.join(root, "auth.sqlite");
process.env.AUTH_DB_PATH = dbPath;
process.env.AUTH_REQUIRED = "true";

const authSession = require("./lib/auth-session.cjs");
const store = authSession.getAuthStore({ filename: dbPath });
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
const operator = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password" });
store.approveOperator({ operatorId: operator.id, approvedBy: admin.id });
const activeOperator = store.getUser(operator.id);

// The target already has a live session. Consuming a reset must revoke it.
const oldSession = store.createSession({ userId: activeOperator.id });
assert.equal(store.getSessionUser(oldSession.token).id, activeOperator.id);

// Only an active super admin can issue a recovery token, and super-admin
// accounts themselves are not reset through this subordinate-account flow.
assert.throws(() => store.preparePasswordReset({ actor: activeOperator, targetUserId: activeOperator.id }), /SUPER_ADMIN_REQUIRED/);
assert.throws(() => store.preparePasswordReset({ actor: admin, targetUserId: admin.id }), /PASSWORD_RESET_TARGET_FORBIDDEN/);

const issued = store.preparePasswordReset({ actor: admin, targetUserId: activeOperator.id, ttlMs: 60_000 });
assert.equal(typeof issued.token, "string");
assert.ok(issued.token.length >= 32);
assert.ok(issued.expiresAt > Date.now());

const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const stored = db.prepare("SELECT * FROM password_reset_tokens").get();
assert.ok(stored, "reset token record should exist");
assert.notEqual(stored.token_hash, issued.token, "only a hash may be stored");
db.close();

const reset = store.consumePasswordReset({ token: issued.token, newPassword: "new-operator-password" });
assert.equal(reset.user.id, activeOperator.id);
assert.equal(store.getSessionUser(oldSession.token), null, "all existing sessions must be revoked");
assert.equal(store.authenticate("13900139000", "new-operator-password").id, activeOperator.id);
assert.equal(store.authenticate("13900139000", "operator-password"), null);
assert.throws(() => store.consumePasswordReset({ token: issued.token, newPassword: "another-password" }), /PASSWORD_RESET_TOKEN_INVALID/);

const audit = store.listAuditLogs({ actor: admin, action: "auth.password.reset", limit: 20 });
assert.equal(audit.items.length, 1);
const metadataText = JSON.stringify(audit.items[0].metadata || {});
assert.equal(metadataText.includes("new-operator-password"), false);
assert.equal(metadataText.includes(issued.token), false);
assert.equal(metadataText.includes("password"), false);
assert.equal(metadataText.includes("token"), false);

function loadHandler(relativePath) {
  const source = fs.readFileSync(path.join(__dirname, relativePath), "utf8")
    .replace(/^import \{([^}]+)\} from .*auth-session\.cjs.*$/m, "const {$1} = authSession;")
    .replace(/^export default async function handler/m, "async function handler");
  const context = { console, JSON, String, Number, Date, process, authSession };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.handler = handler;`, context);
  return context.handler;
}

const issue = loadHandler("pages/api/admin/users/[userId]/password-reset.js");
const consume = loadHandler("pages/api/auth/password-reset.js");
async function call(handler, { method = "POST", body = {}, cookie = "", query = {} } = {}) {
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
  const adminSession = store.createSession({ userId: admin.id });
  const adminCookie = `hh_session=${adminSession.token}`;
  const issuedByApi = await call(issue, { cookie: adminCookie, query: { userId: activeOperator.id } });
  assert.equal(issuedByApi.status, 200);
  assert.equal(typeof issuedByApi.payload.token, "string");
  assert.equal(JSON.stringify(issuedByApi.payload).includes("password"), false);

  const completedByApi = await call(consume, { body: { token: issuedByApi.payload.token, newPassword: "api-reset-password" } });
  assert.equal(completedByApi.status, 200);
  assert.equal(completedByApi.payload.user.id, activeOperator.id);
  const missingToken = await call(consume, { body: { newPassword: "api-reset-password" } });
  assert.equal(missingToken.status, 400);
  assert.equal(missingToken.payload.code, "PASSWORD_RESET_TOKEN_REQUIRED");

  store.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log("test-password-recovery: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
