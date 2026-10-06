const assert = require("node:assert/strict");
const { shouldHydrateWorkspace } = require("./lib/chat-workspace-state.cjs");
const { isCurrentGeneration } = require("./lib/chat-generation-state.cjs");

const item = { latestDraft: "旧草稿", sourceMessageId: "m1", replies: [{ text: "旧候选" }], profile: { summary: "旧画像" } };
assert.equal(shouldHydrateWorkspace({ requestToken: 1, currentToken: 1, touched: false, currentDraft: "", currentReplies: [], currentProfile: null, currentSourceMessageId: "m1", item }), true);
assert.equal(shouldHydrateWorkspace({ requestToken: 1, currentToken: 1, touched: true, currentDraft: "", currentReplies: [], currentProfile: null, item }), false, "生成新候选后不能被旧请求覆盖");
assert.equal(shouldHydrateWorkspace({ requestToken: 1, currentToken: 2, touched: false, currentDraft: "", currentReplies: [], currentProfile: null, item }), false, "切换维护对象后的旧请求不能写回");
assert.equal(shouldHydrateWorkspace({ requestToken: 1, currentToken: 1, touched: false, currentDraft: "主播正在修改", currentReplies: [], currentProfile: null, item }), false, "主播正在编辑草稿时不能覆盖输入框");
assert.equal(shouldHydrateWorkspace({ requestToken: 1, currentToken: 1, touched: false, currentDraft: "", currentReplies: [], currentProfile: null, currentSourceMessageId: "m2", item: { ...item, sourceMessageId: "m2" } }), true, "候选来源与当前目标一致时才能恢复");
assert.equal(shouldHydrateWorkspace({ requestToken: 1, currentToken: 1, touched: false, currentDraft: "", currentReplies: [], currentProfile: null, currentSourceMessageId: "m2", item: { ...item, sourceMessageId: "m1" } }), false, "候选来源与当前目标不一致时不能恢复");
assert.equal(shouldHydrateWorkspace({ requestToken: 1, currentToken: 1, touched: false, currentDraft: "", currentReplies: [], currentProfile: null, currentSourceMessageId: "m2", item }), false, "没有来源标识的旧候选不能覆盖已选消息");
assert.equal(shouldHydrateWorkspace({ requestToken: 1, currentToken: 1, touched: false, currentDraft: "", currentReplies: [], currentProfile: null, item }), false, "消息尚未加载时不能恢复候选，避免刷新串线");

const generation = { token: 3, brotherId: "b1", sourceMessageId: "m2" };
assert.equal(isCurrentGeneration(generation, { token: 3, brotherId: "b1", sourceMessageId: "m2" }), true, "当前 AI 生成批次应允许写回候选");
assert.equal(isCurrentGeneration(generation, { token: 4, brotherId: "b1", sourceMessageId: "m2" }), false, "过期 AI 请求不能覆盖新一轮候选");
assert.equal(isCurrentGeneration(generation, { token: 3, brotherId: "b1", sourceMessageId: "m1" }), false, "旧消息的 AI 回复不能显示在新消息下");
assert.equal(isCurrentGeneration(generation, { token: 3, brotherId: "b2", sourceMessageId: "m2" }), false, "其他维护对象的 AI 回复不能串入当前对象");
console.log("test-chat-workspace-state: ok");
