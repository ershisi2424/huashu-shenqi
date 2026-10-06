const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("components/chat/ChatWorkspace.js", "utf8");
assert.match(source, /PERSONAL_CHAT_ROLES/, "聊天工作台应声明个人工作区允许的角色");
assert.match(source, /scope=\$\{scope\}/, "聊天工作台应按角色请求个人或主播工作区");
assert.match(source, /"personal"/, "运营和超级管理员应可进入自己的个人工作区");
assert.equal(/if \(currentUser\?\.role !== "anchor"\) return <div className=\{styles\.authGate\}/.test(source), false, "运营和超级管理员不能再被个人聊天入口整体拦截");
console.log("test-chat-role-workspace-ui: ok");
