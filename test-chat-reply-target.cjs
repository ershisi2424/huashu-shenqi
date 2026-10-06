const assert = require("node:assert/strict");
const { pickReplyTarget } = require("./lib/chat-reply-target.cjs");

const messages = [
  { id: "old", sender: "brother", status: "confirmed", text: "之前那条", createdAt: "2026-10-04T10:00:00.000Z" },
  { id: "anchor", sender: "anchor", status: "sent", text: "主播回复", createdAt: "2026-10-04T10:01:00.000Z" },
  { id: "latest", sender: "brother", status: "confirmed", text: "刚刚这条", createdAt: "2026-10-04T10:02:00.000Z" },
  { id: "draft", sender: "brother", status: "draft", text: "未确认", createdAt: "2026-10-04T10:03:00.000Z" },
];

assert.equal(pickReplyTarget(messages, "").id, "latest", "没有手动选择时应默认分析最新已确认的大哥消息");
assert.equal(pickReplyTarget(messages, "old").id, "old", "手动选择历史大哥消息时应使用被选中的消息专项分析");
assert.equal(pickReplyTarget(messages, "draft").id, "latest", "未确认消息不能作为 AI 分析目标");
assert.equal(pickReplyTarget(messages, "missing").id, "latest", "选择目标不存在时应安全回退到最新已确认消息");

console.log("test-chat-reply-target: ok");
