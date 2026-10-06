const assert = require("node:assert/strict");
const fs = require("node:fs");

const feature = require("./lib/ocr/feature.cjs");
const component = fs.readFileSync(`${__dirname}/components/chat/ChatWorkspace.js`, "utf8");

assert.equal(feature.SCREENSHOT_OCR_ENABLED, false, "截图 OCR 暂停期间开关必须保持关闭");
assert(component.includes('from "../../lib/ocr/feature.cjs"'), "聊天组件必须读取统一 OCR 功能开关");
assert(component.includes("SCREENSHOT_OCR_ENABLED"), "聊天组件必须使用统一 OCR 功能开关");
assert(component.includes("if (!ENABLE_SCREENSHOT_OCR) return"), "关闭 OCR 时必须在读取文件前立即返回");
assert(component.includes("ENABLE_SCREENSHOT_OCR &&"), "OCR 入口和预览必须整体受关闭开关保护");

console.log("test-ocr-feature: ok");
