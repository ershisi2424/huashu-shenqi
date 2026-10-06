const assert = require("node:assert/strict");
const fs = require("node:fs");

const workspace = fs.readFileSync("components/chat/ChatWorkspace.js", "utf8");
const styles = fs.readFileSync("components/chat/chat.module.css", "utf8");
const profile = fs.readFileSync("pages/api/profile.js", "utf8");

for (const token of ["搜索聊天", "修改", "删除", "关系时间线", "回复风格", "发送前检查", "下次跟进", "运营内部备注"]) {
  assert.ok(workspace.includes(token), `ChatWorkspace should include ${token}`);
}
assert.doesNotMatch(workspace, /toggleMessageMark|>收藏<|>置顶<\//, "ChatWorkspace should not expose favorite or pin actions");
for (const token of ["chatSearch", "messageTools", "deleteMessageButton", "deleteBrotherButton", "relationshipTimeline", "operatorNotes", "replyCheck"]) {
  assert.ok(styles.includes(token), `chat styles should include ${token}`);
}
assert.match(profile, /replyStyle/);
console.log("test-chat-enhancements-ui: ok");
