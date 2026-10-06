const assert = require("node:assert/strict");
const fs = require("node:fs");

const component = fs.readFileSync(`${__dirname}/components/admin/ApprovalCenter.js`, "utf8");
const api = fs.readFileSync(`${__dirname}/pages/api/auth/anchor-approvals.js`, "utf8");
for (const token of ["anchorItems", "待审批主播", "待审批运营", "anchor-approvals", "super_admin", "decide(item.id, \"approve\", kind)", "kind === \"anchor\""]) {
  assert(component.includes(token), `审批中心缺少全量审批契约：${token}`);
}
assert(api.includes('["operator", "super_admin"]'), "主播审批 API 必须允许运营和超级管理员");
assert(component.includes("主播申请"), "超级管理员审批中心必须区分主播申请");
console.log("test-super-admin-approval-ui: ok");
