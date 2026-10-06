const assert = require("node:assert/strict");
const fs = require("node:fs");

const component = fs.readFileSync(`${__dirname}/components/chat/ChatWorkspace.js`, "utf8");
const store = fs.readFileSync(`${__dirname}/lib/chat-local-store.cjs`, "utf8");
const localStore = require("./lib/chat-local-store.cjs");

for (const token of [
  "candidateSaveState",
  "saveGeneratedCandidates",
  "writeReplyDraft",
  "readReplyDraft",
  "await syncWorkspaceSnapshot",
  "候选已保存",
  "sourceMessageId",
  "isCurrentGeneration",
]) {
  assert(component.includes(token), `AI 候选持久化缺少契约：${token}`);
}
for (const token of ["replyDraftStorageKey", "normalizeReplyDraft", "readReplyDraft", "writeReplyDraft"]) {
  assert(store.includes(token), `本地候选暂存缺少契约：${token}`);
}
assert.match(component, /setCandidateSaveState\("saving"\)/, "生成候选时必须进入保存中状态");
assert.match(component, /setCandidateSaveState\("saved"\)/, "服务端保存成功后必须显示已保存状态");

const values = new Map();
const storage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, value); },
  removeItem(key) { values.delete(key); },
};
assert.equal(localStore.writeReplyDraft(storage, "user:anchor-1", "brother-1", { sourceMessageId: "msg-2", replies: [{ style: "自然", text: "收到啦" }] }), true);
assert.equal(localStore.readReplyDraft(storage, "user:anchor-1", "brother-1").replies[0].text, "收到啦");
assert.equal(localStore.readReplyDraft(storage, "user:anchor-1", "brother-1").sourceMessageId, "msg-2", "本机候选必须绑定产生它的大哥消息");
assert.equal(localStore.readReplyDraft(storage, "user:anchor-2", "brother-1"), null, "不同主播不能读取同一份候选暂存");
assert.equal(localStore.clearReplyDraft(storage, "user:anchor-1", "brother-1"), true);
assert.equal(localStore.readReplyDraft(storage, "user:anchor-1", "brother-1"), null);

console.log("test-chat-candidate-persistence: ok");
