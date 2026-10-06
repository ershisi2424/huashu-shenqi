const assert = require("node:assert/strict");
const { isCurrentError, normalizeScope } = require("./lib/chat-error-state.cjs");

assert.deepEqual(normalizeScope({ brotherId: "b1", messageId: "m1" }), { brotherId: "b1", messageId: "m1" });
assert.equal(isCurrentError(null, "b1", "m1"), true, "无作用域的通用错误仍应显示");
assert.equal(isCurrentError({ brotherId: "b1", messageId: "m1" }, "b1", "m1"), true, "当前对象和消息的错误应显示");
assert.equal(isCurrentError({ brotherId: "b1", messageId: "m1" }, "b2", "m1"), false, "切换维护对象后不应显示旧对象错误");
assert.equal(isCurrentError({ brotherId: "b1", messageId: "m1" }, "b1", "m2"), false, "录入新消息后不应显示旧消息错误");
assert.equal(isCurrentError({ brotherId: "b1" }, "b1", "m2"), true, "只绑定对象的任务错误可继续显示");
console.log("✅ 聊天错误作用域测试通过");
