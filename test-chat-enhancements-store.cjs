const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createAuthStore } = require("./lib/auth-store.cjs");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-chat-enhancements-"));
const store = createAuthStore({ filename: path.join(root, "auth.sqlite") });
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
const operator = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password" });
store.approveOperator({ operatorId: operator.id, approvedBy: admin.id });
const anchor = store.createAnchor({ operatorId: operator.id, phone: "13700137000", name: "主播一号", password: "anchor-password" });
const otherOperator = store.registerOperator({ phone: "13600136000", name: "运营二号", password: "operator-password-2" });
store.approveOperator({ operatorId: otherOperator.id, approvedBy: admin.id });
const otherAnchor = store.createAnchor({ operatorId: otherOperator.id, phone: "13500135000", name: "主播二号", password: "anchor-password-2" });

const brother = store.createChatBrother({ actor: anchor, clientId: "enhance_1", nickname: "山哥" });
const otherBrother = store.createChatBrother({ actor: otherAnchor, clientId: "enhance_2", nickname: "海哥" });
const incoming = store.appendChatMessage({ actor: anchor, brotherId: brother.id, message: { id: "enhance_msg_1", sender: "brother", source: "paste", status: "confirmed", text: "晚上好，今天工作有点累" } });
const outgoing = store.appendChatMessage({ actor: anchor, brotherId: brother.id, message: { id: "enhance_msg_2", sender: "anchor", source: "manual", status: "sent", text: "哥辛苦了，早点休息" } });
store.appendChatMessage({ actor: otherAnchor, brotherId: otherBrother.id, message: { id: "enhance_other_msg", sender: "brother", source: "paste", status: "confirmed", text: "这是另一位大哥的消息" } });

const search = store.searchChat({ actor: anchor, query: "工作有点累" });
assert.equal(search.items.length, 1);
assert.equal(search.items[0].messageId, incoming.id);
assert.equal(store.searchChat({ actor: operator, query: "工作有点累" }).items.length, 1);
assert.equal(store.searchChat({ actor: otherOperator, query: "工作有点累" }).items.length, 0);
assert.equal(store.searchChat({ actor: admin, query: "海哥" }).items.length, 1);

const marked = store.setChatMessageMark({ actor: anchor, brotherId: brother.id, messageId: incoming.id, favorite: true, pinned: true });
assert.equal(marked.favorite, true);
assert.equal(marked.pinned, true);
assert.equal(store.listChatMessages({ actor: anchor, brotherId: brother.id }).find((item) => item.id === incoming.id).pinned, true);
assert.throws(() => store.setChatMessageMark({ actor: operator, brotherId: brother.id, messageId: outgoing.id, favorite: true }), /CHAT_MARK_WRITE_DENIED/);

const event = store.createRelationshipEvent({ actor: anchor, brotherId: brother.id, type: "milestone", title: "首次聊到工作", body: "他提到最近项目收尾，之后可以从工作节奏切入" });
assert.equal(event.type, "milestone");
assert.equal(store.listRelationshipEvents({ actor: operator, brotherId: brother.id }).items.length, 1);
assert.throws(() => store.createRelationshipEvent({ actor: operator, brotherId: brother.id, type: "note", title: "不应写入", body: "运营只读" }), /TIMELINE_WRITE_DENIED/);

const note = store.createOperatorNote({ actor: operator, brotherId: brother.id, body: "下次先问项目收尾情况，避免直接聊礼物" });
assert.match(note.body, /项目收尾/);
assert.equal(store.listOperatorNotes({ actor: operator, brotherId: brother.id }).items.length, 1);
assert.equal(store.listOperatorNotes({ actor: admin, brotherId: brother.id }).items.length, 1);
assert.throws(() => store.listOperatorNotes({ actor: anchor, brotherId: brother.id }), /OPERATOR_NOTE_ACCESS_DENIED/);
assert.throws(() => store.createOperatorNote({ actor: otherOperator, brotherId: brother.id, body: "越权" }), /OPERATOR_NOTE_ACCESS_DENIED/);

store.close();
fs.rmSync(root, { recursive: true, force: true });
console.log("test-chat-enhancements-store: ok");
