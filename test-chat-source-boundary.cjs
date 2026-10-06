const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-chat-source-boundary-"));
const store = require("./lib/auth-store.cjs").createAuthStore({ filename: path.join(root, "auth.sqlite") });
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
const operator = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password" });
store.approveOperator({ operatorId: operator.id, approvedBy: admin.id });
const anchor = store.createAnchor({ operatorId: operator.id, phone: "13700137000", name: "主播一号", password: "anchor-password" });
const brother = store.createChatBrother({ actor: anchor, clientId: "source-boundary-a", nickname: "山哥" });
const otherBrother = store.createChatBrother({ actor: anchor, clientId: "source-boundary-b", nickname: "海哥" });
const confirmed = store.appendChatMessage({
  actor: anchor,
  brotherId: brother.id,
  message: { id: "confirmed-source", sender: "brother", source: "paste", status: "confirmed", text: "今天收工了" },
});
const pending = store.appendChatMessage({
  actor: anchor,
  brotherId: brother.id,
  message: { id: "pending-source", sender: "brother", source: "paste", status: "pending_confirmation", text: "尚未确认" },
});
const otherConfirmed = store.appendChatMessage({
  actor: anchor,
  brotherId: otherBrother.id,
  message: { id: "other-source", sender: "brother", source: "paste", status: "confirmed", text: "另一位对象的消息" },
});

assert.throws(
  () => store.saveReplyHistory({ actor: anchor, brotherId: brother.id, currentMessage: confirmed.text, replies: [{ text: "收到啦" }] }),
  /CHAT_SOURCE_MESSAGE_REQUIRED/,
  "回复历史必须绑定来源消息",
);
assert.throws(
  () => store.saveReplyHistory({ actor: anchor, brotherId: brother.id, sourceMessageId: otherConfirmed.id, currentMessage: otherConfirmed.text, replies: [{ text: "串入错误对象" }] }),
  /CHAT_SOURCE_MESSAGE_NOT_FOUND/,
  "回复历史不能绑定其他维护对象的消息",
);
assert.throws(
  () => store.saveReplyHistory({ actor: anchor, brotherId: brother.id, sourceMessageId: pending.id, currentMessage: pending.text, replies: [{ text: "未确认消息" }] }),
  /CHAT_SOURCE_MESSAGE_NOT_FOUND/,
  "回复历史不能绑定未确认的大哥消息",
);
const history = store.saveReplyHistory({
  actor: anchor,
  brotherId: brother.id,
  sourceMessageId: confirmed.id,
  currentMessage: "浏览器篡改的当前消息",
  replies: [{ text: "先接住你刚才说的收工" }],
});
assert.equal(history.sourceMessageId, confirmed.id);
assert.equal(history.currentMessage, confirmed.text, "回复历史当前消息必须以服务端来源消息为准");

assert.throws(
  () => store.saveWorkspaceSnapshot({ actor: anchor, brotherId: brother.id, snapshot: { replies: [{ text: "无来源候选" }] } }),
  /CHAT_SOURCE_MESSAGE_REQUIRED/,
  "带候选的工作台快照必须绑定来源消息",
);
assert.throws(
  () => store.saveWorkspaceSnapshot({ actor: anchor, brotherId: brother.id, snapshot: { sourceMessageId: otherConfirmed.id, replies: [{ text: "串入错误对象" }] } }),
  /CHAT_SOURCE_MESSAGE_NOT_FOUND/,
  "工作台快照不能绑定其他维护对象的消息",
);
assert.throws(
  () => store.saveWorkspaceSnapshot({ actor: anchor, brotherId: brother.id, snapshot: { sourceMessageId: pending.id, replies: [{ text: "未确认消息" }] } }),
  /CHAT_SOURCE_MESSAGE_NOT_FOUND/,
  "工作台快照不能绑定未确认的大哥消息",
);
const snapshot = store.saveWorkspaceSnapshot({ actor: anchor, brotherId: brother.id, snapshot: { sourceMessageId: confirmed.id, latestDraft: "服务端绑定", replies: [{ text: "绑定正确" }] } });
assert.equal(snapshot.sourceMessageId, confirmed.id);

assert.ok(admin.id);
store.close();
fs.rmSync(root, { recursive: true, force: true });
console.log("test-chat-source-boundary: ok");
