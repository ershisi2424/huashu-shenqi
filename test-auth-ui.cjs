const assert = require("node:assert/strict");
const fs = require("node:fs");

const login = fs.readFileSync(`${__dirname}/components/auth/LoginWorkspace.js`, "utf8");
const loginStyle = fs.readFileSync(`${__dirname}/components/auth/auth.module.css`, "utf8");
const page = fs.readFileSync(`${__dirname}/pages/login.js`, "utf8");
const chat = fs.readFileSync(`${__dirname}/components/chat/ChatWorkspace.js`, "utf8");
const health = fs.readFileSync(`${__dirname}/pages/api/health.js`, "utf8");

for (const token of ["/api/auth/login/", "/api/auth/register/", "/api/auth/operators/", "运营注册", "主播注册", "运营选择", "等待审批", "手机号", "自定义密码", "登录"]) {
  assert(login.includes(token), `登录界面缺少契约：${token}`);
}
for (const token of ["authRequired", "currentUser", "/api/auth/me/", "去登录", "超级管理员", "运营", "主播"]) {
  assert(chat.includes(token), `聊天入口缺少鉴权契约：${token}`);
}
assert(loginStyle.includes("@media"), "登录页面需要响应式布局");
assert(page.includes("LoginWorkspace"), "登录页面必须渲染 LoginWorkspace");
assert(health.includes("authRequired"), "健康接口需要显示是否强制登录");
console.log("✅ 登录与角色入口契约测试通过");
