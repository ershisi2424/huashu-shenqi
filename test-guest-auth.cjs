const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const Database = require("better-sqlite3");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-guest-auth-"));
const dbPath = path.join(root, "auth.sqlite");
process.env.AUTH_DB_PATH = dbPath;
process.env.AUTH_REQUIRED = "true";
process.env.GUEST_PHONE_HMAC_SECRET = "test-guest-phone-secret";

const authSession = require("./lib/auth-session.cjs");
const { createAuthStore } = require("./lib/auth-store.cjs");
const store = authSession.getAuthStore();
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });

function loadHandler(relativePath) {
  const source = fs.readFileSync(path.join(__dirname, relativePath), "utf8")
    .replace(/^import \{([^}]+)\} from .*auth-session\.cjs.*$/m, "const {$1} = authSession;")
    .replace(/^export default async function handler/m, "async function handler");
  const context = { console, JSON, String, Number, Date, process, authSession };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.handler = handler;`, context);
  return context.handler;
}

const guestLogin = loadHandler("pages/api/auth/guest-login.js");
const guestMe = loadHandler("pages/api/auth/guest-me.js");
const logout = loadHandler("pages/api/auth/logout.js");
const formalMe = loadHandler("pages/api/auth/me.js");
const snapshots = loadHandler("pages/api/chat/workspace-snapshots.js");

async function call(handler, { method = "POST", body = {}, cookie = "", query = {} } = {}) {
  let status = 200;
  let payload;
  const headers = {};
  const req = { method, body, query, headers: { cookie }, socket: { remoteAddress: "127.0.0.1" } };
  const res = {
    setHeader(name, value) { headers[name] = value; },
    getHeader(name) { return headers[name]; },
    status(value) { status = value; return this; },
    json(value) { payload = value; return this; },
    end() { payload = null; return this; },
  };
  await handler(req, res);
  return { status, payload, headers };
}

function cookieFrom(response) {
  const header = Array.isArray(response.headers["Set-Cookie"])
    ? response.headers["Set-Cookie"].join(";")
    : String(response.headers["Set-Cookie"] || "");
  const match = header.match(/hh_guest_session=([^;]+)/);
  assert.ok(match, "游客登录必须设置 hh_guest_session Cookie");
  return `hh_guest_session=${match[1]}`;
}

function assertGuestShape(guest) {
  assert.ok(guest && guest.id, "返回匿名 guest id");
  assert.equal(guest.name, "临时游客");
  assert.equal(guest.status, "active");
  assert.ok(Number.isFinite(Number(guest.expiresAt)));
  for (const forbidden of ["phone", "phoneHmac", "token", "tokenHash"]) assert.equal(forbidden in guest, false, `游客响应不得返回 ${forbidden}`);
}

(async () => {
  const initialDb = new Database(dbPath);
  const usersBefore = initialDb.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  initialDb.close();
  assert.equal(usersBefore, 1);

  const firstLogin = await call(guestLogin, { body: { phone: "13900139000" } });
  assert.equal(firstLogin.status, 200);
  assertGuestShape(firstLogin.payload.guest);
  const firstCookie = cookieFrom(firstLogin);
  const firstGuestId = firstLogin.payload.guest.id;

  // Logging into the temporary workspace from a browser that still has a
  // formal cookie must revoke that formal session before ChatWorkspace's
  // formal-first bootstrap runs.
  const mixedSession = store.createSession({ userId: admin.id });
  const mixedLogin = await call(guestLogin, {
    body: { phone: "13900139002" },
    cookie: `hh_session=${mixedSession.token}`,
  });
  assert.equal(mixedLogin.status, 200);
  const mixedSetCookie = Array.isArray(mixedLogin.headers["Set-Cookie"]) ? mixedLogin.headers["Set-Cookie"] : [mixedLogin.headers["Set-Cookie"]];
  assert.ok(mixedSetCookie.some((cookie) => /hh_session=;/.test(String(cookie))), "游客登录应清除旧正式 Cookie");
  assert.equal((await call(formalMe, { method: "GET", cookie: `hh_session=${mixedSession.token}` })).status, 401, "游客登录应撤销旧正式会话");

  const firstMe = await call(guestMe, { method: "GET", cookie: firstCookie });
  assert.equal(firstMe.status, 200);
  assert.equal(firstMe.payload.guest.id, firstGuestId);
  assertGuestShape(firstMe.payload.guest);
  assert.match(String(firstMe.headers["Set-Cookie"] || ""), /hh_guest_session=/, "guest-me 必须刷新游客 Cookie 生命周期");

  const secondLoginSamePhone = await call(guestLogin, { body: { phone: "13900139000" } });
  assert.equal(secondLoginSamePhone.status, 200);
  assertGuestShape(secondLoginSamePhone.payload.guest);
  assert.notEqual(secondLoginSamePhone.payload.guest.id, firstGuestId, "同一手机号的新游客登录不得恢复旧临时身份");
  const secondCookie = cookieFrom(secondLoginSamePhone);

  const differentPhone = await call(guestLogin, { body: { phone: "13900139001" } });
  assert.equal(differentPhone.status, 200);
  assertGuestShape(differentPhone.payload.guest);
  assert.notEqual(differentPhone.payload.guest.id, secondLoginSamePhone.payload.guest.id);

  const formalMeWithGuest = await call(formalMe, { method: "GET", cookie: secondCookie });
  assert.equal(formalMeWithGuest.status, 401, "游客不能冒充正式用户");
  const snapshotWithGuest = await call(snapshots, { method: "GET", cookie: secondCookie, query: { anchorId: "not-a-real-anchor" } });
  assert.equal(snapshotWithGuest.status, 401, "游客不能调用正式主播只读快照");

  const loggedOut = await call(logout, { cookie: secondCookie });
  assert.equal(loggedOut.status, 204);
  const logoutCookies = Array.isArray(loggedOut.headers["Set-Cookie"]) ? loggedOut.headers["Set-Cookie"] : [loggedOut.headers["Set-Cookie"]];
  assert.ok(logoutCookies.some((cookie) => /hh_guest_session=/.test(String(cookie))));
  assert.ok(logoutCookies.some((cookie) => /hh_session=/.test(String(cookie))));
  const guestAfterLogout = await call(guestMe, { method: "GET", cookie: secondCookie });
  assert.equal(guestAfterLogout.status, 401);

  const db = new Database(dbPath);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM users").get().count, usersBefore, "游客流程不得写入 users");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM chat_brothers").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM chat_messages").get().count, 0);
  const guestRows = db.prepare("SELECT * FROM guest_accounts").all();
  assert.ok(guestRows.length >= 2);
  assert.equal(Object.hasOwn(guestRows[0], "phone"), false);
  assert.equal(Object.hasOwn(guestRows[0], "phone_hmac"), true);

  // guest-me itself runs cleanup; an expired, revoked account should disappear
  // without touching formal users or chat tables.
  db.prepare("UPDATE guest_accounts SET expires_at = ?, last_seen_at = ? WHERE id = ?")
    .run(Date.now() - 1, new Date(Date.now() - 24 * 60 * 60 * 1000 - 1).toISOString(), secondLoginSamePhone.payload.guest.id);
  assert.equal((await call(guestMe, { method: "GET", cookie: secondCookie })).status, 401);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM guest_accounts WHERE id = ?").get(secondLoginSamePhone.payload.guest.id).count, 0);

  store.revokeGuestSession(firstCookie.split("=")[1]);
  const differentCookie = cookieFrom(differentPhone);
  store.revokeGuestSession(differentCookie.split("=")[1]);
  db.prepare("UPDATE guest_accounts SET expires_at = ?, last_seen_at = ?").run(Date.now() - 1, new Date(Date.now() - 24 * 60 * 60 * 1000 - 1).toISOString());
  db.prepare("UPDATE guest_sessions SET expires_at = ?, last_seen_at = ?, revoked_at = ?").run(Date.now() - 1, new Date(Date.now() - 24 * 60 * 60 * 1000 - 1).toISOString(), Date.now() - 1);
  const cleanup = store.cleanupGuestData(Date.now());
  assert.ok(cleanup.deletedAccounts >= 2, "超过 24 小时且无活动会话的游客账户应被清理");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM guest_accounts").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM users").get().count, usersBefore, "清理游客不得删除正式账号");
  db.close();
  store.close();

  // Without an environment secret, the generated deployment secret is persisted
  // server-side and reused after a store restart; it never appears in guest data.
  const fallbackPath = path.join(root, "fallback.sqlite");
  const configuredSecret = process.env.GUEST_PHONE_HMAC_SECRET;
  delete process.env.GUEST_PHONE_HMAC_SECRET;
  const fallbackStore1 = createAuthStore({ filename: fallbackPath });
  fallbackStore1.createGuestSession("13900139009");
  fallbackStore1.close();
  const fallbackDb1 = new Database(fallbackPath);
  const persistedSecret = fallbackDb1.prepare("SELECT value FROM guest_secrets WHERE id = 'phone_hmac'").get().value;
  fallbackDb1.close();
  const fallbackStore2 = createAuthStore({ filename: fallbackPath });
  fallbackStore2.close();
  const fallbackDb2 = new Database(fallbackPath);
  const persistedSecretAgain = fallbackDb2.prepare("SELECT value FROM guest_secrets WHERE id = 'phone_hmac'").get().value;
  assert.equal(persistedSecretAgain, persistedSecret);
  assert.notEqual(persistedSecret, "13900139009");
  fallbackDb2.close();
  process.env.GUEST_PHONE_HMAC_SECRET = configuredSecret;
  fs.rmSync(root, { recursive: true, force: true });
  console.log("test-guest-auth: ok");
})().catch((error) => {
  console.error(error);
  try { store.close(); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
  process.exit(1);
});
