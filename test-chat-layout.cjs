const assert = require("node:assert/strict");
const fs = require("node:fs");

const styles = fs.readFileSync(`${__dirname}/components/chat/chat.module.css`, "utf8");

// 桌面工作台的聊天记录可以滚动，但回复区必须自然展开；否则候选卡片会被父容器裁掉。
const layoutContract = styles.slice(styles.lastIndexOf("/* Desktop chat layout contract:"));
assert(layoutContract.includes(".layout{height:auto"), "桌面工作台不能用固定视口高度裁切回复区");
assert(layoutContract.includes(".chat{min-height:0;overflow:visible"), "聊天主列不能用 overflow:hidden 裁切回复工作区");
assert(layoutContract.includes(".replyWorkspace{align-items:start;max-height:none;overflow:visible"), "回复工作区必须自然展开而不是内部滚动裁切候选卡片");
assert(layoutContract.includes(".timeline{flex:0 1 auto;min-height:240px;max-height:"), "聊天记录应由单独的时间线滚动容器承载");

console.log("test-chat-layout: ok");
