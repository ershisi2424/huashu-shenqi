const assert = require("node:assert/strict");
const fs = require("node:fs");

const component = fs.readFileSync("components/admin/UsageWorkspace.js", "utf8");
const nav = fs.readFileSync("components/admin/AdminNav.js", "utf8");
assert.match(component, /api\/admin\/usage/);
assert.match(component, /api\/health/);
assert.match(component, /replyRate|使用率/);
assert.match(component, /不会显示 API Key/);
assert.match(nav, /admin\/usage/);
console.log("test-admin-usage-ui: ok");
