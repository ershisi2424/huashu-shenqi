const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync(`${__dirname}/pages/index.js`, "utf8");
assert.match(source, /runtime-ui-projection/, "旧首页必须使用 Runtime UI 投影适配层");
assert.match(source, /projectRuntimeAnalysis\(payload\)/, "成功响应必须从服务端 payload 生成正式分析状态");
assert.doesNotMatch(source, /setAnalysis\(localAnalysis\)/, "本地预判不得写入正式分析状态");
assert.match(source, /setAnalysis\(null\)/, "请求开始或失败必须清理旧的正式分析状态");

console.log("test-runtime-ui-projection-contract: ok");
