const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { discoverTests } = require("./scripts/verification/discovery.cjs");
const { runSuite, testEnvironment } = require("./scripts/verification/runner.cjs");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-runner-test-"));
try {
  assert.deepEqual(discoverTests(root), []);
  assert.throws(() => runSuite(root), /EMPTY_TEST_SUITE/);
  fs.mkdirSync(path.join(root, "test-directory.cjs"));
  fs.writeFileSync(path.join(root, "ignored.txt"), "ignored");
  fs.writeFileSync(path.join(root, "test-b.cjs"), "process.exit(0)");
  fs.writeFileSync(path.join(root, "test-a.cjs"), "process.exit(0)");
  assert.deepEqual(discoverTests(root), ["test-a.cjs", "test-b.cjs"]);
  const passed = runSuite(root, { stdio: "pipe" });
  assert.equal(passed.ok, true);
  assert.equal(passed.results.length, 2);
  assert(passed.results.every((item) => item.status === "passed" && item.exitCode === 0));
  fs.writeFileSync(path.join(root, "test-a.cjs"), "process.exit(2)");
  const failed = runSuite(root, { stdio: "pipe" });
  assert.equal(failed.ok, false);
  assert.equal(failed.results.length, 1, "失败后不得继续下一项测试");
  assert.equal(failed.results[0].exitCode, 2);
  fs.writeFileSync(path.join(root, "test-a.cjs"), "setInterval(() => {}, 1000)");
  const timedOut = runSuite(root, { stdio: "pipe", timeoutMs: 200 });
  assert.equal(timedOut.ok, false);
  assert.equal(timedOut.results[0].errorCode, "ETIMEDOUT");
  const env = testEnvironment({ PATH: "/bin", SystemRoot: "C:\\Windows", ZAI_API_KEY: "do-not-forward", SMOKE_SESSION_COOKIE: "do-not-forward", AUTH_DB_PATH: "/real/db", NODE_OPTIONS: "--inspect", AWS_SECRET_ACCESS_KEY: "do-not-forward" }, root);
  assert.equal(env.ZAI_API_KEY, undefined);
  assert.equal(env.SMOKE_SESSION_COOKIE, undefined);
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(env.NODE_ENV, "test");
  assert.equal(env.AUTH_DB_PATH, path.join(root, "auth.sqlite"));
  assert.equal(env.SystemRoot, "C:\\Windows");
  fs.writeFileSync(path.join(root, "test-a.cjs"), `const fs = require('fs'); if (!process.env.AUTH_DB_PATH.includes('huashu-suite-')) process.exit(3); fs.writeFileSync(process.env.AUTH_DB_PATH, 'synthetic');`);
  fs.writeFileSync(path.join(root, "test-b.cjs"), `if (require('fs').existsSync(process.env.AUTH_DB_PATH)) process.exit(4);`);
  assert.equal(runSuite(root, { stdio: "pipe" }).ok, true, "每个测试进程应使用不同数据库路径");
  const all = discoverTests(__dirname);
  assert(all.includes("test-chat-role-workspace.cjs"));
  assert(all.includes("test-chat-role-workspace-ui.cjs"));
  assert.equal(all.includes("test-verification-runner.cjs"), false, "runner 自测不能递归执行自己");
  assert.equal(new Set(all).size, all.length);
  console.log("test-verification-runner: ok");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
