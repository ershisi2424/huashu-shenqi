const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-server-chat-"));
const store = require("./lib/auth-store.cjs").createAuthStore({ filename: path.join(root, "auth.sqlite") });
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
const operator = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password" });
store.approveOperator({ operatorId: operator.id, approvedBy: admin.id });
const anchor = store.createAnchor({ operatorId: operator.id, phone: "13700137000", name: "主播一号", password: "anchor-password" });

const brother = store.createChatBrother({ actor: anchor, clientId: "bro_local_1", nickname: "山哥" });
assert.equal(brother.nickname, "山哥");
assert.equal(brother.ownerUserId, anchor.id);
assert.equal(store.listChatBrothers({ actor: anchor }).length, 1);
assert.equal(store.listChatBrothers({ actor: operator }).length, 1);
assert.equal(store.listChatBrothers({ actor: admin }).length, 1);

const inbound = store.appendChatMessage({
  actor: anchor,
  brotherId: brother.id,
  message: { id: "msg_in_1", sender: "brother", source: "paste", status: "confirmed", text: "今天忙完了吗？", createdAt: "2026-09-30T08:00:00.000Z" },
});
assert.equal(inbound.sender, "brother");
assert.equal(typeof store.getChatGenerationContext, "function", "服务端必须提供绑定当前大哥消息的 AI 生成上下文");
const generationContext = store.getChatGenerationContext({ actor: anchor, brotherId: brother.id, sourceMessageId: inbound.id });
assert.equal(generationContext.sourceMessageId, inbound.id);
assert.equal(generationContext.currentMessage, "今天忙完了吗？");
assert.ok(Array.isArray(generationContext.history));
assert.throws(() => store.getChatGenerationContext({ actor: anchor, brotherId: brother.id, sourceMessageId: "missing-message" }), /CHAT_SOURCE_MESSAGE_NOT_FOUND/);
const corrected = store.editChatMessage({ actor: anchor, brotherId: brother.id, messageId: inbound.id, text: "今天忙完了吗？（已修正）" });
assert.equal(corrected.text, "今天忙完了吗？（已修正）");
const outbound = store.appendChatMessage({
  actor: anchor,
  brotherId: brother.id,
  message: { id: "msg_out_1", sender: "anchor", source: "manual", status: "sent", text: "刚忙完，看到你的消息了。", createdAt: "2026-09-30T08:01:00.000Z", sentAt: "2026-09-30T08:01:00.000Z" },
});
assert.equal(outbound.status, "sent");
const correctedOutbound = store.editChatMessage({ actor: anchor, brotherId: brother.id, messageId: outbound.id, text: "刚忙完，看到你的消息了。（已修正）" });
assert.equal(correctedOutbound.status, "sent");
assert.equal(correctedOutbound.sentAt, "2026-09-30T08:01:00.000Z");
assert.equal(correctedOutbound.text, "刚忙完，看到你的消息了。（已修正）");
assert.equal(store.listChatMessages({ actor: operator, brotherId: brother.id }).length, 2);
assert.equal(store.listChatMessages({ actor: anchor, brotherId: brother.id })[0].text, "今天忙完了吗？（已修正）");

const overview = store.getOperatorOverview({ actor: operator });
assert.equal(overview.anchors.length, 1);
assert.equal(overview.anchors[0].messageCount, 2);
assert.equal(overview.recentMessages.length, 2);
const globalOverview = store.getOperatorOverview({ actor: admin });
assert.equal(globalOverview.operators.length, 1);
assert.equal(globalOverview.anchors.length, 1);
const otherAnchor = store.createAnchor({ operatorId: operator.id, phone: "13600136000", name: "主播二号", password: "anchor-password-2" });
assert.throws(() => store.listChatMessages({ actor: otherAnchor, brotherId: brother.id }), /CHAT_ACCESS_DENIED/);

store.close();
fs.rmSync(root, { recursive: true, force: true });
console.log("test-server-chat: ok");
