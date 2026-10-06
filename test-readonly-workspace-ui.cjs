const assert = require("node:assert/strict");
const fs = require("node:fs");

const anchor = fs.readFileSync(`${__dirname}/components/chat/ChatWorkspace.js`, "utf8");
const viewer = fs.readFileSync(`${__dirname}/components/chat/ReadonlyAnchorWorkspace.js`, "utf8");
const page = fs.readFileSync(`${__dirname}/pages/chat/viewer.js`, "utf8");

for (const token of ["/api/chat/workspace-snapshots/", "setTimeout", "latestDraft", "replies"]) assert(anchor.includes(token), `主播端缺少工作台快照契约：${token}`);
for (const token of ["/api/chat/workspace-snapshots/", "/api/chat/notes/", "只读", "最新草稿", "AI 候选", "运营维护点评", "保存点评", "返回后台"]) assert(viewer.includes(token), `只读工作台缺少契约：${token}`);
assert(!viewer.includes("生成 AI 回复"), "只读工作台不得提供 AI 生成按钮");
assert(!viewer.includes("确认已发送"), "只读工作台不得提供发送确认按钮");
assert(page.includes("ReadonlyAnchorWorkspace"), "只读工作台页面必须渲染 ReadonlyAnchorWorkspace");
console.log("✅ 主播工作台同步与只读预览契约测试通过");
