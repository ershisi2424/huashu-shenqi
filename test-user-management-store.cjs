const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createAuthStore } = require("./lib/auth-store.cjs");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-user-management-"));
const store = createAuthStore({ filename: path.join(root, "auth.sqlite") });

const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "超级管理员", password: "admin-password" });
const operator = store.registerOperator({ phone: "13900139000", name: "运营甲", password: "operator-password" });
store.approveOperator({ operatorId: operator.id, approvedBy: admin.id });
const anchor = store.createAnchor({ operatorId: operator.id, phone: "13700137000", name: "主播甲", password: "anchor-password" });
const anchorSession = store.createSession({ userId: anchor.id, ttlMs: 60 * 60 * 1000 });

const brother = store.createChatBrother({ actor: anchor, clientId: "brother-a", nickname: "山哥" });
store.appendChatMessage({
  actor: anchor,
  brotherId: brother.id,
  message: { id: "message-a", sender: "brother", source: "paste", status: "confirmed", text: "晚上好" },
});

const usageBefore = store.listUserUsage({ actor: admin });
const anchorUsageBefore = usageBefore.items.find((item) => item.id === anchor.id);
assert.equal(anchorUsageBefore.status, "active");
assert.equal(anchorUsageBefore.brotherCount, 1);
assert.equal(anchorUsageBefore.messageCount, 1);
assert.ok(anchorUsageBefore.lastActionAt);

const disabled = store.changeUserStatus({ actor: admin, targetUserId: anchor.id, status: "disabled" });
assert.equal(disabled.status, "disabled");
assert.equal(store.getSessionUser(anchorSession.token), null, "disabling an account revokes its sessions");
assert.equal(store.authenticate("13700137000", "anchor-password"), null, "disabled accounts cannot authenticate");

const usageDisabled = store.listUserUsage({ actor: admin });
assert.equal(usageDisabled.items.find((item) => item.id === anchor.id).status, "disabled");
assert.equal(store.listChatBrothers({ actor: admin }).find((item) => item.id === brother.id).messageCount, 1, "disable keeps chat data");

const restored = store.changeUserStatus({ actor: admin, targetUserId: anchor.id, status: "active" });
assert.equal(restored.status, "active");
assert.ok(store.authenticate("13700137000", "anchor-password"));

assert.throws(
  () => store.changeUserStatus({ actor: admin, targetUserId: admin.id, status: "disabled" }),
  /USER_STATUS_FORBIDDEN/,
  "an administrator cannot disable their own account",
);

const confirmation = store.prepareUserDeletion({ actor: admin, targetUserId: anchor.id });
assert.ok(confirmation.token);
assert.ok(confirmation.expiresAt > Date.now());
assert.throws(
  () => store.confirmUserDeletion({ actor: admin, targetUserId: anchor.id, token: "wrong-token" }),
  /USER_DELETE_CONFIRMATION_INVALID/,
);

const deleted = store.confirmUserDeletion({ actor: admin, targetUserId: anchor.id, token: confirmation.token });
assert.equal(deleted.deletedUserId, anchor.id);
assert.equal(store.getUser(anchor.id), null);
assert.equal(store.listChatBrothers({ actor: admin }).some((item) => item.id === brother.id), false, "deleting an anchor removes its maintained brothers");

const deletionAudit = store.listAuditLogs({ actor: admin, action: "user.delete", limit: 100 });
assert.equal(deletionAudit.items.length, 1);
assert.equal(deletionAudit.items[0].target.id, anchor.id);
assert.equal(deletionAudit.items[0].target.name, "主播甲");

const dependentAnchor = store.createAnchor({ operatorId: operator.id, phone: "13700137001", name: "主播乙", password: "anchor-password-b" });
const operatorWithAnchor = store.getUser(operator.id);
const operatorConfirmation = store.prepareUserDeletion({ actor: admin, targetUserId: operatorWithAnchor.id });
assert.throws(
  () => store.confirmUserDeletion({ actor: admin, targetUserId: operatorWithAnchor.id, token: operatorConfirmation.token }),
  /USER_DELETE_HAS_DEPENDENTS/,
  "operators with anchors require dependent cleanup first",
);

assert.throws(
  () => store.prepareUserDeletion({ actor: admin, targetUserId: admin.id }),
  /USER_DELETE_FORBIDDEN/,
  "an administrator cannot permanently delete their own account",
);

store.close();
fs.rmSync(root, { recursive: true, force: true });
console.log("test-user-management-store: ok");
