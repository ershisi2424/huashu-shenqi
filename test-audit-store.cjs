const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createAuthStore } = require("./lib/auth-store.cjs");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-audit-store-"));
const store = createAuthStore({ filename: path.join(root, "auth.sqlite") });

const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
const operatorA = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password-a" });
store.approveOperator({ operatorId: operatorA.id, approvedBy: admin.id });
const operatorB = store.registerOperator({ phone: "13900139001", name: "运营二号", password: "operator-password-b" });
store.approveOperator({ operatorId: operatorB.id, approvedBy: admin.id });
const anchorA = store.createAnchor({ operatorId: operatorA.id, phone: "13700137000", name: "主播一号", password: "anchor-password-a" });
const anchorB = store.createAnchor({ operatorId: operatorB.id, phone: "13700137001", name: "主播二号", password: "anchor-password-b" });

const brotherA = store.createChatBrother({ actor: anchorA, clientId: "bro_a", nickname: "山哥" });
store.appendChatMessage({
  actor: anchorA,
  brotherId: brotherA.id,
  message: { id: "msg_a", sender: "brother", source: "paste", status: "confirmed", text: "晚上好" },
});
const brotherB = store.createChatBrother({ actor: anchorB, clientId: "bro_b", nickname: "海哥" });
store.appendChatMessage({
  actor: anchorB,
  brotherId: brotherB.id,
  message: { id: "msg_b", sender: "anchor", source: "manual", status: "sent", text: "看到你的消息了" },
});

const all = store.listAuditLogs({ actor: admin, limit: 100 });
assert.ok(Array.isArray(all.items));
assert.ok(all.items.some((item) => item.chatMessage?.text === "晚上好"));
assert.ok(all.items.some((item) => item.chatMessage?.direction === "left"));
assert.ok(all.items.some((item) => item.chatMessage?.direction === "right"));
assert.ok(all.items.every((item) => !/(password|token|secret)/i.test(JSON.stringify(item.metadata))));

const firstOperator = store.listAuditLogs({ actor: operatorA, limit: 100 });
assert.ok(firstOperator.items.some((item) => item.actor?.id === anchorA.id));
assert.ok(firstOperator.items.some((item) => item.actor?.id === operatorA.id));
assert.ok(firstOperator.items.some((item) => item.chatMessage?.text === "晚上好"));
assert.ok(firstOperator.items.every((item) => item.actor?.id !== anchorB.id));
assert.ok(firstOperator.items.every((item) => item.target?.id !== anchorB.id));

const actionFiltered = store.listAuditLogs({ actor: admin, action: "chat.message.append", limit: 100 });
assert.ok(actionFiltered.items.length >= 2);
assert.ok(actionFiltered.items.every((item) => item.action === "chat.message.append"));
const roleFiltered = store.listAuditLogs({ actor: admin, role: "anchor", limit: 100 });
assert.ok(roleFiltered.items.length >= 2);
assert.ok(roleFiltered.items.every((item) => item.actor?.role === "anchor" || item.target?.role === "anchor"));

const firstPage = store.listAuditLogs({ actor: admin, limit: 2 });
assert.equal(firstPage.items.length, 2);
assert.ok(firstPage.nextCursor);
const secondPage = store.listAuditLogs({ actor: admin, limit: 2, cursor: firstPage.nextCursor });
assert.ok(secondPage.items.length > 0);
assert.ok(!secondPage.items.some((item) => firstPage.items.some((first) => first.id === item.id)));

assert.throws(() => store.listAuditLogs({ actor: anchorA }), /AUDIT_ACCESS_DENIED/);

store.close();
fs.rmSync(root, { recursive: true, force: true });
console.log("test-audit-store: ok");
