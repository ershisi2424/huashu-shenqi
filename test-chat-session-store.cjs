const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  chatSessionStorageKey,
  clearChatSessionSnapshot,
  readChatSessionSnapshot,
  writeChatSessionSnapshot,
} = require("./lib/chat-session-store.cjs");

const data = new Map();
const storage = {
  getItem(key) { return data.get(key) ?? null; },
  setItem(key, value) { data.set(key, value); },
  removeItem(key) { data.delete(key); },
};

const snapshot = {
  version: 1,
  brothers: [{ id: "b1", nickname: "陈哥" }],
  messages: [{ id: "m1", brotherId: "b1", sender: "brother", text: "刚刚刷新也不能丢" }],
  activeBrotherId: "b1",
  replyStyle: "balanced",
  profileSources: { works: "", comments: "", statements: "" },
};

assert.equal(writeChatSessionSnapshot(storage, "guest", snapshot), true);
assert.equal(readChatSessionSnapshot(storage, "guest").messages[0].text, "刚刚刷新也不能丢");
assert.equal(readChatSessionSnapshot(storage, "user:anchor-2").messages.length, 0, "不同主播账号不能读取其他账号的会话");
assert.equal(chatSessionStorageKey("user:anchor-1"), "hh_chat_session_v1:user_anchor-1");
assert.equal(chatSessionStorageKey(""), "hh_chat_session_v1:guest");

clearChatSessionSnapshot(storage, "guest");
assert.equal(readChatSessionSnapshot(storage, "guest").messages.length, 0);

const workspace = fs.readFileSync("components/chat/ChatWorkspace.js", "utf8");
assert.match(workspace, /readChatSessionSnapshot\(window\.localStorage, storageScope\)/);
assert.match(workspace, /writeChatSessionSnapshot\(window\.localStorage, storageScope, value\)/);
assert.match(workspace, /if \(memoryEnabled\) writeChatSnapshot/);

console.log("✅ 刷新后当前会话保留与账号隔离测试通过");
