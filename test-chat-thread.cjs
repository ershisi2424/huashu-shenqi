const assert = require("node:assert/strict");
const { createBrother, createMessage, addMessage, editMessageText, markSent, removeMessage } = require("./lib/chat-thread.cjs");

const brother = createBrother({ nickname: "陈哥" }, "b1");
assert.equal(brother.id, "b1");
assert.equal(brother.nickname, "陈哥");
assert.equal(
  createMessage({ id: "m1", brotherId: "b1", sender: "brother", text: "到家了", source: "paste" }).direction,
  "left",
);
assert.equal(
  createMessage({ id: "m2", brotherId: "b1", sender: "anchor", text: "吃过饭没", source: "manual" }).direction,
  "right",
);
const draft = createMessage({ id: "m3", brotherId: "b1", sender: "anchor", text: "有空聊聊", source: "ai_draft" });
assert.equal(draft.status, "draft");
assert.equal(markSent(draft, "2026-09-30T12:00:00.000Z").status, "sent");
assert.deepEqual(addMessage([], draft).map((item) => item.id), ["m3"]);
const editable = createMessage({ id: "m4", brotherId: "b1", sender: "brother", text: "粘贴错了", source: "paste" });
const edited = editMessageText([editable], "m4", "已经修正");
assert.equal(edited[0].text, "已经修正");
assert.notEqual(edited[0].updatedAt, editable.updatedAt);
const sent = markSent(draft, "2026-09-30T12:00:00.000Z");
const editedSent = editMessageText([sent], "m3", "已修正的已发送消息")[0];
assert.equal(editedSent.text, "已修正的已发送消息");
assert.equal(editedSent.status, "sent");
assert.equal(editedSent.sentAt, sent.sentAt);
assert.throws(() => editMessageText([editable], "missing", "不存在"), /MESSAGE_NOT_FOUND/);
assert.deepEqual(removeMessage([editable, sent], "m4").map((item) => item.id), ["m3"]);
assert.deepEqual(removeMessage([editable, sent], "missing").map((item) => item.id), ["m4", "m3"]);
assert.throws(() => createMessage({ id: "bad", brotherId: "b1", sender: "invalid", text: "x" }));

console.log("✅ 聊天领域模型测试通过");
