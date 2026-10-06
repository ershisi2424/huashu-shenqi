const assert = require("node:assert/strict");
const fs = require("node:fs");

const packageJson = require("./package.json");
const runnerPath = "scripts/browser-regression/agent-browser-smoke.cjs";
assert.equal(fs.existsSync(runnerPath), true, "真实浏览器冒烟器文件必须存在");
const source = fs.readFileSync(runnerPath, "utf8");

for (const token of [
  "assertSafeBrowserRegressionEnv",
  "BROWSER_REGRESSION_EXECUTE",
  "AGENT_BROWSER_NOT_FOUND",
  "spawnSync",
  "--session",
  "networkidle",
  "get",
  "close",
]) assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `浏览器冒烟器缺少 ${token}`);

assert.equal(packageJson.scripts["browser:smoke"], "node scripts/browser-regression/agent-browser-smoke.cjs");
assert.doesNotMatch(source, /ZAI_API_KEY|GLM_API_KEY|COOKIE_HEADER|PLAYWRIGHT_STORAGE_STATE/, "浏览器冒烟器不得读取或传递真实凭据");
assert.match(source, /BROWSER_RUNNER_NOT_ENABLED/, "默认必须保持关闭，避免误启动浏览器");

console.log("test-agent-browser-smoke-contract: ok");
