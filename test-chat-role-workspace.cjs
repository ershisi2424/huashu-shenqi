const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createAuthStore } = require("./lib/auth-store.cjs");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-chat-role-workspace-"));
const store = createAuthStore({ filename: path.join(root, "auth.sqlite") });
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
const operator = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password" });
store.approveOperator({ operatorId: operator.id, approvedBy: admin.id });
const anchor = store.createAnchor({ operatorId: operator.id, phone: "13700137000", name: "主播一号", password: "anchor-password" });

const anchorBrother = store.createChatBrother({ actor: anchor, clientId: "anchor-brother", nickname: "主播大哥" });
const operatorBrother = store.createChatBrother({ actor: operator, clientId: "operator-brother", nickname: "运营测试对象" });
const adminBrother = store.createChatBrother({ actor: admin, clientId: "admin-brother", nickname: "管理测试对象" });

assert.equal(store.listChatBrothers({ actor: operator, scope: "personal" }).map((item) => item.id).includes(operatorBrother.id), true, "运营个人工作区必须可见自己的维护对象");
assert.equal(store.listChatBrothers({ actor: operator, scope: "personal" }).some((item) => item.id === anchorBrother.id), false, "运营个人工作区不能混入主播维护对象");
assert.equal(store.listChatBrothers({ actor: admin, scope: "personal" }).map((item) => item.id).includes(adminBrother.id), true, "最高管理个人工作区必须可见自己的维护对象");
assert.equal(store.listChatBrothers({ actor: admin, scope: "personal" }).some((item) => item.id === anchorBrother.id), false, "最高管理个人工作区不能混入主播维护对象");
assert.equal(store.listChatBrothers({ actor: operator }).some((item) => item.id === anchorBrother.id), true, "默认运营范围仍可查看所辖主播对象");

const inbound = store.appendChatMessage({
  actor: operator,
  brotherId: operatorBrother.id,
  message: { id: "operator-inbound", sender: "brother", source: "paste", status: "confirmed", text: "运营自己的测试消息" },
});
assert.equal(inbound.text, "运营自己的测试消息");
const generationContext = store.getChatGenerationContext({ actor: operator, brotherId: operatorBrother.id, sourceMessageId: inbound.id });
assert.equal(generationContext.currentMessage, inbound.text, "AI 上下文必须从服务端当前目标消息读取");
assert.throws(() => store.getChatGenerationContext({ actor: operator, brotherId: operatorBrother.id, sourceMessageId: "missing-source" }), /CHAT_SOURCE_MESSAGE_NOT_FOUND/, "不存在的目标消息不能进入 AI 分析");
assert.equal(store.searchChat({ actor: operator, query: "运营自己的", scope: "personal" }).items.some((item) => item.brotherId === operatorBrother.id), true);
assert.equal(store.searchChat({ actor: operator, query: "主播大哥", scope: "personal" }).items.some((item) => item.brotherId === anchorBrother.id), false, "运营个人搜索不能命中主播私人聊天");
const outbound = store.appendChatMessage({
  actor: operator,
  brotherId: operatorBrother.id,
  message: { id: "operator-outbound", sender: "anchor", source: "manual", status: "sent", text: "运营自己的测试回复" },
});
assert.equal(outbound.status, "sent");
const snapshot = store.saveWorkspaceSnapshot({ actor: operator, brotherId: operatorBrother.id, snapshot: { sourceMessageId: inbound.id, latestDraft: "运营草稿", replies: [{ style: "自然", text: "运营候选" }] } });
assert.equal(snapshot.sourceMessageId, inbound.id);
const history = store.saveReplyHistory({ actor: operator, brotherId: operatorBrother.id, sourceMessageId: inbound.id, currentMessage: inbound.text, replies: [{ style: "自然", text: "运营候选" }] });
assert.equal(history.sourceMessageId, inbound.id);
const adminInbound = store.appendChatMessage({ actor: admin, brotherId: adminBrother.id, message: { id: "admin-inbound", sender: "brother", source: "paste", status: "confirmed", text: "管理自己的测试消息" } });
assert.equal(adminInbound.text, "管理自己的测试消息");
assert.equal(store.saveWorkspaceSnapshot({ actor: admin, brotherId: adminBrother.id, snapshot: { sourceMessageId: adminInbound.id, latestDraft: "管理草稿" } }).latestDraft, "管理草稿");
assert.throws(() => store.listChatMessages({ actor: anchor, brotherId: operatorBrother.id }), /CHAT_ACCESS_DENIED/, "主播不能读取运营自己的工作区");
assert.throws(() => store.appendChatMessage({ actor: operator, brotherId: anchorBrother.id, message: { sender: "anchor", source: "manual", status: "sent", text: "不应写入主播工作区" } }), /CHAT_WRITE_DENIED/, "运营不能写入主播私人对象");

store.close();
fs.rmSync(root, { recursive: true, force: true });
console.log("test-chat-role-workspace: ok");
