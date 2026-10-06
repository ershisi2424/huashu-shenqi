const assert = require("node:assert/strict");
const { chatStorageKey, memoryEnabledKey, readChatSnapshot, writeChatSnapshot, clearChatSnapshot } = require("./lib/chat-local-store.cjs");

const data = new Map();
let reads = 0;
const storage = {
  getItem(key) { reads += 1; return data.get(key) ?? null; },
  setItem(key, value) { data.set(key, value); },
  removeItem(key) { data.delete(key); },
};

assert.deepEqual(readChatSnapshot(storage, false).brothers, []);
assert.equal(reads, 0, "关闭记忆时不得读取持久化数据");
assert.equal(writeChatSnapshot(storage, false, { brothers: [], messages: [] }), false);
assert.equal(data.size, 0, "关闭记忆时不得写入持久化数据");
assert.equal(writeChatSnapshot(storage, true, { brothers: [{ id: "b1", nickname: "陈哥" }], messages: [], profileSources: { works: "钓鱼视频", comments: "评论", statements: "公开发言" } }), true);
const restored = readChatSnapshot(storage, true);
assert.equal(restored.brothers[0].id, "b1");
assert.deepEqual(restored.profileSources, { works: "钓鱼视频", comments: "评论", statements: "公开发言" });
assert.equal(chatStorageKey("user:anchor-1"), "hh_chat_v1:user_anchor-1");
assert.equal(memoryEnabledKey("user:anchor-1"), "hh_memory_enabled:user_anchor-1");
assert.equal(writeChatSnapshot(storage, true, { brothers: [{ id: "b1" }], messages: [] }, chatStorageKey("user:anchor-1")), true);
assert.equal(writeChatSnapshot(storage, true, { brothers: [{ id: "b2" }], messages: [] }, chatStorageKey("user:anchor-2")), true);
assert.equal(readChatSnapshot(storage, true, chatStorageKey("user:anchor-2")).brothers[0].id, "b2");
assert.equal(readChatSnapshot(storage, true, chatStorageKey("user:anchor-1")).brothers[0].id, "b1");
clearChatSnapshot(storage);
clearChatSnapshot(storage, chatStorageKey("user:anchor-1"));
clearChatSnapshot(storage, chatStorageKey("user:anchor-2"));
assert.equal(data.size, 0);

console.log("✅ 聊天本地记忆门禁测试通过");
