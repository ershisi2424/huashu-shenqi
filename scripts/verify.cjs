const path = require("node:path");
const { discoverTests } = require("./verification/discovery.cjs");
const { DEFAULT_TIMEOUT_MS, runSuite } = require("./verification/runner.cjs");

const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const allowed = new Set(["--list", "--timeout-ms"]);
for (const arg of args) {
  if (arg === "--list" || arg === "--timeout-ms") continue;
  if (arg.startsWith("--timeout-ms=")) continue;
  console.error(`未知参数：${arg}`);
  process.exit(2);
}
const tests = discoverTests(root);
if (args.includes("--list")) {
  process.stdout.write(`${tests.join("\n")}\n`);
  process.exit(0);
}
const timeoutArg = args.find((arg) => arg.startsWith("--timeout-ms="));
const timeoutMs = timeoutArg ? Number(timeoutArg.slice("--timeout-ms=".length)) : DEFAULT_TIMEOUT_MS;
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  console.error("--timeout-ms 必须是正数");
  process.exit(2);
}
const result = runSuite(root, { timeoutMs, stdio: "inherit" });
console.log(`验证套件：${result.results.length} 项，${result.ok ? "全部通过" : "在失败处停止"}`);
if (!result.ok) {
  const failed = result.results.at(-1);
  console.error(`失败：${failed.file} · ${failed.errorCode || `exit=${failed.exitCode}`}`);
  process.exit(1);
}
