const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync(`${__dirname}/components/admin/ApprovalCenter.js`, "utf8");

for (const token of ["operatorLoading", "operatorError", "anchorLoading", "anchorError"]) {
  assert.match(source, new RegExp(`\\b${token}\\b`), `审批中心必须维护独立状态：${token}`);
}
assert.match(source, /loadOperatorQueue|loadAnchorQueue/, "审批中心必须提供独立的队列加载函数");
assert.doesNotMatch(source, /Promise\.all\(\[operatorResponse, anchorResponse\]/,
  "运营队列和主播队列不能由一个 Promise.all 绑定失败");
assert.match(source, /user\?\.role\s*===\s*["']operator["'][\s\S]{0,800}renderApprovalQueue\(items,\s*["']anchor["']/,
  "运营账号加载的主播申请必须使用主播队列动作");
assert.match(source, /loadAnchorQueue\(\{\s*visibleAsOperator:\s*true\s*\}\)|visibleAsOperator[\s\S]{0,240}setItems\(/,
  "运营账号审批主播后必须刷新当前可见队列");

console.log("test-approval-isolation: ok");
