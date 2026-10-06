const assert = require("node:assert/strict");
const { isNearBottom } = require("./lib/chat-scroll.cjs");

assert.equal(isNearBottom({ scrollTop: 500, clientHeight: 300, scrollHeight: 820 }), true);
assert.equal(isNearBottom({ scrollTop: 450, clientHeight: 300, scrollHeight: 820 }), false);
assert.equal(isNearBottom({ scrollTop: 0, clientHeight: 400, scrollHeight: 400 }), true);
assert.equal(isNearBottom({ scrollTop: 0, clientHeight: 400, scrollHeight: 500, threshold: 0 }), false);

console.log("✅ 聊天滚动边界测试通过");
