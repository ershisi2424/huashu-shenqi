const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createAuthStore, normalizePhone, hashPassword, verifyPassword } = require("./lib/auth-store.cjs");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-auth-"));
const dbPath = path.join(root, "auth.sqlite");
const store = createAuthStore({ filename: dbPath });

assert.equal(normalizePhone(" 138 0013 8000 "), "13800138000");
const passwordHash = hashPassword("demo-password");
assert.notEqual(passwordHash, "demo-password");
assert.equal(verifyPassword("demo-password", passwordHash), true);
assert.equal(verifyPassword("wrong-password", passwordHash), false);

const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
assert.equal(admin.role, "super_admin");
assert.equal(admin.status, "active");
assert.equal("passwordHash" in admin, false);

const pendingOperator = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password" });
assert.equal(pendingOperator.role, "operator");
assert.equal(pendingOperator.status, "pending");
assert.equal(store.authenticate("13900139000", "operator-password"), null, "未审批运营不能登录");

const approvedOperator = store.approveOperator({ operatorId: pendingOperator.id, approvedBy: admin.id });
assert.equal(approvedOperator.status, "active");
const operator = store.authenticate("13900139000", "operator-password");
assert.equal(operator.id, pendingOperator.id);
assert.equal("passwordHash" in operator, false);

const anchor = store.createAnchor({
  operatorId: operator.id,
  phone: "13700137000",
  name: "主播一号",
  password: "anchor-password",
});
assert.equal(anchor.role, "anchor");
assert.equal(anchor.operatorId, operator.id);
assert.equal(store.listAnchorsForOperator(operator.id).length, 1);

const session = store.createSession({ userId: anchor.id, ttlMs: 60_000 });
assert.equal(typeof session.token, "string");
assert.equal(store.getSessionUser(session.token).id, anchor.id);
store.revokeSession(session.token);
assert.equal(store.getSessionUser(session.token), null);

const audit = store.listAuditLogs({ actor: admin });
assert.ok(audit.items.some((row) => row.action === "operator.approve"));
assert.ok(audit.items.every((row) => !String(row.metadata || "").includes("password")));

store.close();
fs.rmSync(root, { recursive: true, force: true });
console.log("test-auth-store: ok");
