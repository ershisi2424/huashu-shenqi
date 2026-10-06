const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const docPath = path.join(root, "docs", "production", "BROWSER-REGRESSION.md");
const doc = fs.readFileSync(docPath, "utf8");

assert.match(doc, /AUTH_DB_PATH=<临时目录>\/auth\.sqlite/, "浏览器回归必须使用明确的临时数据库路径");
assert.match(doc, /NODE_ENV=test/, "浏览器回归必须显式使用测试环境");
assert.match(doc, /AUTH_REQUIRED=true/, "浏览器回归必须显式打开认证");
assert.match(doc, /不能使用 `http:\/\/127\.0\.0\.1:3102`/, "浏览器回归必须拒绝当前开发服务端口");
assert.match(doc, /不读取、不修改正在运行的 3102 服务/, "契约必须声明不触碰当前服务");
assert.match(doc, /data\/auth\.sqlite/, "契约必须拒绝项目正式数据库");
assert.match(doc, /不输出密码、Token、Cookie 或数据库内容/, "浏览器回归日志不得泄露凭据");
assert.match(doc, /切换对象期间返回的旧请求必须丢弃/, "浏览器回归必须覆盖旧请求乱序");
assert.match(doc, /刷新后历史候选只能恢复其真实来源消息/, "浏览器回归必须覆盖刷新恢复和来源绑定");
assert.match(doc, /listen EPERM/, "当前环境的临时端口阻断必须留下实测证据");

console.log("test-browser-regression-contract: ok");
