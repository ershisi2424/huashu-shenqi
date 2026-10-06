/* eslint-disable */
const fs = require("fs");

function assert(value, message) {
  if (!value) throw new Error(message);
}

const page = fs.readFileSync(__dirname + "/pages/index.js", "utf8");
const styles = fs.readFileSync(__dirname + "/styles/globals.css", "utf8");

assert(page.includes("智谱 AI 服务"), "页面应提供智谱 AI 服务状态入口");
assert(page.includes("重新检查"), "设置面板应提供重新检查按钮");
assert(page.includes("模型"), "设置面板应显示当前模型");
assert(page.includes("接口地址"), "设置面板应显示当前端点");
assert(page.includes("apiHealthRefreshing"), "页面应有健康检查加载状态");
assert(page.includes("超级管理员统一维护"), "页面应说明 API 配置由管理员统一维护");
assert(!page.includes("saveApiSettings"), "普通聊天页不得提供保存 API 配置动作");
assert(!page.includes("apiSettingsForm"), "普通聊天页不得保留 API Key 表单状态");
assert(styles.includes(".api-settings"), "设置面板应有独立样式");

console.log("✅ 智谱 API 设置面板契约测试通过");
