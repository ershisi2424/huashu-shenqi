const assert = require("node:assert/strict");
const fs = require("node:fs");

const component = fs.readFileSync(`${__dirname}/components/admin/AdminWorkspace.js`, "utf8");
const styles = fs.readFileSync(`${__dirname}/components/admin/admin.module.css`, "utf8");
const page = fs.readFileSync(`${__dirname}/pages/admin.js`, "utf8");

for (const token of ["/api/auth/me/", "/api/auth/approvals/", "/api/auth/anchor-approvals/", "/api/ops/audit/", "超级管理员", "待审批运营", "待审批主播", "操作审计", "角色筛选", "动作筛选", "展开聊天正文", "加载更多", "chatMessage.text", "批准", "拒绝"]) {
  assert(component.includes(token), `最高权限审批页面缺少契约：${token}`);
}
assert(!component.includes("删除审计记录"), "审计页面不得提供删除审计记录操作");
assert(styles.includes("@media"), "审批页面需要响应式布局");
assert(page.includes("AdminWorkspace"), "管理员页面必须渲染 AdminWorkspace");
console.log("✅ 超级管理员审批页面契约测试通过");
