const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("components/chat/ChatWorkspace.js", "utf8");

assert.match(source, /const \[serverBrothersRevision, setServerBrothersRevision\] = useState\(0\)/, "服务端维护对象列表需要有同步版本号");
assert.match(source, /setServerBrothersRevision\(\(value\) => value \+ 1\)/, "服务端维护对象同步完成后需要递增版本号");
assert.match(source, /serverBrothersRevision\]\);/, "消息加载需要依赖服务端维护对象同步版本号");
assert.match(source, /serverBrothersRevision\]\);/, "工作台相关数据加载需要依赖服务端维护对象同步版本号");

console.log("test-chat-message-hydration: ok");
