const assert = require("node:assert/strict");
const fs = require("node:fs");

const component = fs.readFileSync(`${__dirname}/components/chat/ChatWorkspace.js`, "utf8");

assert.match(component, /<button type="button" onClick=\{\(\) => \{ markWorkspaceTouched\(\); setAnchorDraft\(reply\.text \|\| ""\)/, "选择 AI 候选必须是普通按钮，不能触发表单提交刷新");
assert.match(component, /<button type="button" className=\{`\$\{styles\.brotherItem/, "切换维护对象必须是普通按钮");
assert.match(component, /<button type="button" onClick=\{enableMemory\}/, "启用本地记忆必须是普通按钮");
assert.match(component, /<button type="button" className=\{styles\.confirmButton\}/, "录入大哥消息必须是普通按钮");
assert.match(component, /<button type="button" className=\{styles\.generateButton\}/, "生成按钮必须是普通按钮");
assert.match(component, /<button type="button" className=\{styles\.copyButton\}/, "复制按钮必须是普通按钮");
assert.match(component, /<button type="button" className=\{styles\.sentButton\}/, "标记发送按钮必须是普通按钮");

console.log("test-chat-selection-no-refresh: ok");
