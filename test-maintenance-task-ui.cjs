const assert = require("node:assert/strict");
const fs = require("node:fs");

const component = fs.readFileSync(`${__dirname}/components/tasks/MaintenanceTaskWorkspace.js`, "utf8");
const page = fs.readFileSync(`${__dirname}/pages/tasks.js`, "utf8");
const chat = fs.readFileSync(`${__dirname}/components/chat/ChatWorkspace.js`, "utf8");
const styles = fs.readFileSync(`${__dirname}/components/tasks/task.module.css`, "utf8");

for (const token of ["/api/chat/tasks/", "/api/chat/brothers/?scope=managed", "待回复", "待跟进", "稍后处理", "已完成", "更新任务", "添加维护任务", "维护对象", "下一步建议", "只读查看", "任务中心", "返回工作后台", "workBackendHref", "/admin/"]) {
  assert(component.includes(token), `任务中心缺少契约：${token}`);
}
for (const token of ["method: \"POST\"", "正在添加", "setForm(EMPTY_FORM)", "canCreate", "createTask", "createRequestId", "loadSequence", "currentLoad", "刷新列表失败"]) {
  assert(component.includes(token), `新增任务交互缺少契约：${token}`);
}
assert(chat.includes("syncTaskPlan"), "AI 生成后必须同步任务下一步建议");
assert(chat.includes("nextAction"), "聊天任务卡必须显示下一步建议");
assert(page.includes("MaintenanceTaskWorkspace"), "任务页必须渲染任务工作台");
assert(chat.includes("任务中心"), "聊天工作台必须提供任务中心入口");
assert(chat.includes("pending_reply"), "收到大哥消息后聊天页必须感知待回复任务");
for (const token of ["@media", "min-height", "overflow", "createPanel", "createForm", "data-theme=\"dark\""]) {
  assert(styles.includes(token), `任务中心样式缺少契约：${token}`);
}

console.log("test-maintenance-task-ui: ok");
