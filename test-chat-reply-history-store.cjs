const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-reply-history-"));
const store = require("./lib/auth-store.cjs").createAuthStore({ filename: path.join(root, "auth.sqlite") });
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
const operator = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password" });
store.approveOperator({ operatorId: operator.id, approvedBy: admin.id });
const otherOperator = store.registerOperator({ phone: "13900139001", name: "运营二号", password: "operator-password-b" });
store.approveOperator({ operatorId: otherOperator.id, approvedBy: admin.id });
const anchor = store.createAnchor({ operatorId: operator.id, phone: "13700137000", name: "主播一号", password: "anchor-password" });
const otherAnchor = store.createAnchor({ operatorId: otherOperator.id, phone: "13700137001", name: "主播二号", password: "anchor-password-b" });
const brother = store.createChatBrother({ actor: anchor, clientId: "history-brother", nickname: "山哥" });
const otherBrother = store.createChatBrother({ actor: otherAnchor, clientId: "history-brother", nickname: "海哥" });
store.appendChatMessage({ actor: anchor, brotherId: brother.id, message: { id: "msg-1", sender: "brother", source: "paste", status: "confirmed", text: "今天项目收尾了" } });
store.appendChatMessage({ actor: anchor, brotherId: brother.id, message: { id: "msg-2", sender: "brother", source: "paste", status: "confirmed", text: "终于可以歇会儿了" } });

const first = store.saveReplyHistory({ actor: anchor, brotherId: brother.id, sourceMessageId: "msg-1", currentMessage: "今天项目收尾了", replyStyle: "warm", replies: [{ style: "温暖细腻", text: "收尾了就好，今天也辛苦你了", rationale: "回应具体经历" }] });
const second = store.saveReplyHistory({ actor: anchor, brotherId: brother.id, sourceMessageId: "msg-2", currentMessage: "终于可以歇会儿了", replyStyle: "brief", replies: [{ style: "简短利落", text: "那就先好好歇会儿", rationale: "保持轻量" }] });
assert.notEqual(first.id, second.id);
const history = store.listReplyHistory({ actor: anchor, brotherId: brother.id });
assert.equal(history.items.length, 2);
assert.equal(history.items[0].replies[0].text, "那就先好好歇会儿");
assert.equal(history.items[1].sourceMessageId, "msg-1");
assert.equal(store.listReplyHistory({ actor: operator, brotherId: brother.id }).items.length, 2);
assert.equal(store.listReplyHistory({ actor: admin, brotherId: brother.id }).items.length, 2);
assert.throws(() => store.listReplyHistory({ actor: otherAnchor, brotherId: brother.id }), /CHAT_ACCESS_DENIED/);
assert.throws(() => store.saveReplyHistory({ actor: otherAnchor, brotherId: brother.id, replies: [{ text: "越权" }] }), /CHAT_ACCESS_DENIED/);
assert.equal(store.listReplyHistory({ actor: otherAnchor, brotherId: otherBrother.id }).items.length, 0);

store.close();
fs.rmSync(root, { recursive: true, force: true });
console.log("test-chat-reply-history-store: ok");
