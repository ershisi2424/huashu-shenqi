const assert = require("node:assert/strict");
const fs = require("node:fs");

const styles = fs.readFileSync(`${__dirname}/components/chat/chat.module.css`, "utf8");

assert(
  styles.includes("@media (max-width:900px){.layout{height:auto;min-height:0"),
  "601–900px 宽度下工作台不能继续使用固定视口高度，否则 AI 回复区会被压缩",
);
assert(
  styles.includes(".replyList{max-height:none;overflow:visible}"),
  "601–900px 宽度下候选列表应跟随页面自然展开，避免卡片被内部滚动容器裁切",
);
for (const token of [".relationshipDock", ".replyWorkspace", ".aiCandidateShelf", ".relationshipHeader"]) {
  assert(styles.includes(token), `响应式工作台缺少区域样式：${token}`);
}
assert(styles.includes(".replyComposer textarea") && styles.includes("width:100%"), "主播回复工作区的输入框必须占满可用宽度");

console.log("test-chat-reply-responsive: ok");
