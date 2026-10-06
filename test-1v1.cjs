/* eslint-disable */
const fs = require("fs");

const html = fs.readFileSync(__dirname + "/public/1v1.html", "utf8");
if (!html.includes('window.location.replace("/")')) {
  throw new Error("旧 1v1 入口必须跳转到强制使用智谱 GLM-5.3 的主应用");
}
if (/generateOnePerPersonality|generateReplies/.test(html)) {
  throw new Error("旧入口不得保留本地回复生成器");
}
console.log("✅ 旧 1v1 入口已统一跳转到智谱 GLM-5.3 主应用");
