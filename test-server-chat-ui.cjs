const assert = require("node:assert/strict");
const fs = require("node:fs");

const chat = fs.readFileSync(`${__dirname}/components/chat/ChatWorkspace.js`, "utf8");
const admin = fs.readFileSync(`${__dirname}/components/admin/AdminWorkspace.js`, "utf8");
const adminStyle = fs.readFileSync(`${__dirname}/components/admin/admin.module.css`, "utf8");
for (const token of ["/api/chat/brothers/", "/api/chat/messages/", "服务端同步", "serverSync"]) {
  assert(chat.includes(token), `聊天工作台缺少服务端同步契约：${token}`);
}
for (const token of ["/api/ops/overview/", "/api/auth/anchors/", "运营复盘", "主播账号", "消息记录"]) {
  assert(admin.includes(token), `运营看板缺少契约：${token}`);
}
assert(adminStyle.includes("@media"), "运营看板需要响应式布局");
console.log("✅ 服务端聊天与运营看板契约测试通过");
