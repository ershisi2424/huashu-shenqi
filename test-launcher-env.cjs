const assert = require("assert");
const fs = require("fs");
const path = require("path");

const candidates = [
  path.join(__dirname, "启动大哥维护系统.command"),
  path.join(__dirname, "..", "启动大哥维护系统.command"),
];
const launcherPath = candidates.find((candidate) => fs.existsSync(candidate));
assert(launcherPath, "仓库内或兼容位置缺少启动大哥维护系统.command");
const launcher = fs.readFileSync(launcherPath, "utf8");

assert(
  /env\s+-u\s+ZAI_API_KEY\s+-u\s+ZHIPU_MODEL\s+-u\s+ZHIPU_BASE_URL/.test(launcher),
  "启动快捷文件必须清除继承的智谱环境变量，确保使用 .env.local 的当前配置",
);

console.log("✅ 启动快捷文件不会继承旧的智谱 API 配置");
