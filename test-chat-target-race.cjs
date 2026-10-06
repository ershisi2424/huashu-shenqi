const assert = require("node:assert/strict");
const fs = require("node:fs");
const { isCurrentGeneration } = require("./lib/chat-generation-state.cjs");

const component = fs.readFileSync(`${__dirname}/components/chat/ChatWorkspace.js`, "utf8");

const targetSwitch = component.match(/const setActiveBrother = \(id\) => \{([\s\S]*?)\n  \};/);
assert(targetSwitch, "维护对象切换逻辑必须存在");
for (const token of ["setProfile(null);", "setCoreDecision(null);", "setAlgorithmCore(null);"]) {
  assert(targetSwitch[1].includes(token), `切换维护对象时必须清空旧对象状态：${token}`);
}

const historySave = component.match(/const saveReplyHistory = async \(\{([\s\S]*?)\n  \};/);
assert(historySave, "回复历史保存逻辑必须存在");
assert.match(historySave[0], /generationRequest/, "回复历史保存必须携带生成批次");
assert.match(historySave[0], /isCurrentGeneration\(/, "回复历史异步返回必须校验生成批次");
assert.match(historySave[0], /if \(generationRequest && !isCurrentGeneration\(/, "切换维护对象后旧历史结果不得写回当前界面");

const generation = { token: 7, brotherId: "brother-a", sourceMessageId: "message-a" };
assert.equal(isCurrentGeneration(generation, generation), true);
assert.equal(isCurrentGeneration(generation, { token: 8, brotherId: "brother-b", sourceMessageId: "message-b" }), false);
console.log("test-chat-target-race: ok");
