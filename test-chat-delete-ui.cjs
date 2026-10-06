const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("components/chat/ChatWorkspace.js", "utf8");

assert.doesNotMatch(source, /toggleMessageMark|>收藏<|>置顶<|aria-label=.*收藏|aria-label=.*置顶/, "聊天工作台不应再显示收藏或置顶操作");
assert.match(source, /deleteMessage/, "聊天消息需要删除入口");
assert.match(source, /deleteBrother/, "维护对象需要删除入口");
assert.match(source, /window\.confirm\(/, "删除必须二次确认");
assert.match(source, /\/api\/chat\/messages\//, "消息删除需要沿用聊天服务端接口");
assert.match(source, /\/api\/chat\/brothers\//, "维护对象删除需要沿用维护对象服务端接口");

console.log("test-chat-delete-ui: ok");
