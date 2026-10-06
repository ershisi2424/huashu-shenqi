const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const requiredMarkers = {
  ".env.example": "服务端配置示例说明",
  "lib/goutoujunshi-core.js": "Runtime 边界说明",
  "lib/goutoujunshi-runtime/constants.js": "Runtime 常量说明",
  "lib/goutoujunshi-runtime/input.js": "Runtime 输入边界说明",
  "lib/goutoujunshi-runtime/contract.js": "Runtime 输出契约说明",
  "lib/goutoujunshi-runtime/decision.js": "Runtime 决策说明",
  "pages/api/profile.js": "服务端 AI 链路说明",
  "lib/local-config.cjs": "本地 Provider 配置说明",
  "lib/ai-provider.cjs": "Provider 调用说明",
  "lib/reply-check.cjs": "发送前校验说明",
  "vendor/goutoujunshi/SKILL.md": "项目集成说明",
};

for (const [relativePath, marker] of Object.entries(requiredMarkers)) {
  const filePath = path.join(root, relativePath);
  const source = fs.readFileSync(filePath, "utf8");
  assert.ok(source.includes(marker), `${relativePath} 缺少注释标记：${marker}`);
}

console.log("runtime/provider 配置注释完整性检查通过");
