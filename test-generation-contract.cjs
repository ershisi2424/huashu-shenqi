const assert = require("assert");
const fs = require("fs");

const source = fs.readFileSync(__dirname + "/pages/index.js", "utf8");
const apiStart = source.indexOf("/api/profile/");
const apiBlock = apiStart >= 0 ? source.slice(apiStart, apiStart + 2600) : "";

assert(source.includes("runAiGeneration"), "页面应有统一的 AI 生成入口");
assert(source.includes("/api/profile/"), "正式 AI 分析必须通过服务端 /api/profile/ 入口");
assert(!source.includes("analyzeGoutoujunshi"), "页面不得直接调用 goutoujunshi Runtime，避免浏览器与服务端双重分析");
assert(source.includes("algorithmCore"), "页面必须保留 goutoujunshi 核心算法证据链");
assert(apiBlock.includes("replyCount"), "AI 请求应声明原创回复数量");
assert(apiBlock.includes("replyPreferences"), "AI 请求应发送回复偏好而不是本地候选");
assert(!apiBlock.includes("candidates:"), "AI 请求不得发送本地固定候选话术");
assert(source.includes("GLM-5.3 原创回复"), "结果界面应标记为 GLM-5.3 原创回复");
assert(source.includes("messageOverride: record.msg"), "历史再生成应重新调用 AI");
assert(source.includes("messageOverride: rec.brotherMessage"), "档案重调应重新调用 AI");

console.log("✅ 页面已切换为 GLM-5.3 直接原创回复契约");
