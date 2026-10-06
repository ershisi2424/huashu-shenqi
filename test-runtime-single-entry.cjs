const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync(`${__dirname}/pages/index.js`, "utf8");
const generationStart = source.indexOf("const runAiGeneration");
assert(generationStart >= 0, "页面必须保留统一的 runAiGeneration 入口");
const generationEnd = source.indexOf("  const handleAiGenerate", generationStart);
assert(generationEnd > generationStart, "无法定位 runAiGeneration 结束位置");
const generation = source.slice(generationStart, generationEnd);

assert(source.includes("/api/profile/"), "页面必须保留服务端 /api/profile/ 入口");
const profileMarker = "/api/profile/";
const profileIndex = generation.indexOf(profileMarker);
assert(profileIndex >= 0, "runAiGeneration 必须请求 /api/profile/");
const fetchIndex = generation.lastIndexOf("fetch(", profileIndex);
assert(fetchIndex >= 0, "无法定位 /api/profile/ 对应的 fetch 请求");
const bodyMarker = "body: JSON.stringify(";
const bodyStart = generation.indexOf(bodyMarker, profileIndex);
assert(bodyStart > fetchIndex, "runAiGeneration 必须保留 /api/profile/ 请求 body");

function extractJsonObject(sourceText, markerIndex) {
  const objectStart = sourceText.indexOf("{", markerIndex + bodyMarker.length);
  assert(objectStart >= 0, "无法定位 /api/profile/ 请求 body 对象");
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = objectStart; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return sourceText.slice(objectStart, index + 1);
    }
  }
  throw new Error("无法找到 /api/profile/ 请求 body 的闭合对象");
}

const requestBody = extractJsonObject(generation, bodyStart);
assert.equal(
  source.includes("analyzeGoutoujunshi("),
  false,
  "旧浏览器分析路径仍在：页面不得直接调用 analyzeGoutoujunshi",
);
assert.equal(
  source.includes("analyzeGoutoujunshi"),
  false,
  "旧浏览器分析路径仍在：页面不得残留 analyzeGoutoujunshi 导入或引用",
);

const hasRelationshipState = /["']?relationshipState["']?\s*(?:,|:)/.test(requestBody);
assert.equal(hasRelationshipState, false, "浏览器不得向 /api/profile/ 发送 relationshipState（包括 shorthand 和显式属性）");

for (const [field, pattern] of [
  ["sources", /\.\.\.\s*sources\b|["']?sources["']?\s*:/],
  ["currentMessage", /["']?currentMessage["']?\s*(?:,|:)/],
  ["history", /["']?history["']?\s*(?:,|:)/],
  ["replyPreferences", /["']?replyPreferences["']?\s*(?:,|:)/],
  ["consent", /["']?consent["']?\s*(?:,|:)/],
]) {
  assert(pattern.test(requestBody), `/api/profile/ 请求 body 缺少必要字段：${field}`);
}

console.log("test-runtime-single-entry: ok");
