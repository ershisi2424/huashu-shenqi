const assert = require("node:assert/strict");
const fs = require("node:fs");

const component = fs.readFileSync(`${__dirname}/components/admin/ApprovalCenter.js`, "utf8");
const audit = fs.readFileSync(`${__dirname}/components/admin/AuditWorkspace.js`, "utf8");
const users = fs.readFileSync(`${__dirname}/components/admin/UserManagementWorkspace.js`, "utf8");
const styles = fs.readFileSync(`${__dirname}/components/admin/admin.module.css`, "utf8");
const page = fs.readFileSync(`${__dirname}/pages/admin.js`, "utf8");

for (const token of ["/api/auth/me/", "/api/auth/approvals/", "/api/auth/anchor-approvals/", "审批中心", "待审批运营", "待审批主播", "批准", "拒绝"]) {
  assert(component.includes(token), `最高权限审批页面缺少契约：${token}`);
}
for (const token of ["approvalPage", "approvalSummary", "approvalQueue", "审批申请", "approvalItemActions", "aria-busy", "type=\"submit\""]) {
  assert(component.includes(token), `审批中心 UI 缺少契约：${token}`);
}
for (const token of ["approvalPage", "approvalSummary", "approvalQueue", "approvalItem", "approveButton", "rejectButton", "createPanel", "approval-focus-ring"]) {
  assert(styles.includes(token), `审批中心样式缺少契约：${token}`);
}
for (const token of ["/api/ops/audit/actors/", "按运营或主播", "展开聊天正文", "聊天正文"]) assert(audit.includes(token), `操作日志页面缺少契约：${token}`);
for (const token of ["/api/admin/users/", "永久删除", "停用", "恢复", "确认永久删除", "/chat/viewer/", "进入工作台"]) assert(users.includes(token), `用户管理页面缺少契约：${token}`);
for (const token of ["adminPage", "adminCard", "adminHeader", "adminIdentity", "adminNotice", "adminLoading"]) {
  assert(audit.includes(token), `操作日志统一页壳缺少契约：${token}`);
  assert(users.includes(token), `用户管理统一页壳缺少契约：${token}`);
}
for (const token of ["adminPage", "adminCard", "adminHeader", "adminIdentity", "adminNotice", "adminLoading", "admin-focus-ring"]) {
  assert(styles.includes(token), `后台统一样式缺少契约：${token}`);
}
for (const token of ["/api/ops/overview/", "我的主播", "进入主播工作台"]) assert(component.includes(token), `运营审批页面缺少契约：${token}`);
assert(!users.includes("删除审计记录"), "审计记录不得提供删除操作");
assert(styles.includes("@media"), "审批页面需要响应式布局");
assert(page.includes("ApprovalCenter"), "管理员页面必须渲染 ApprovalCenter");
console.log("✅ 超级管理员审批页面契约测试通过");
