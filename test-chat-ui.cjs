const assert = require("node:assert/strict");
const fs = require("node:fs");

const component = fs.readFileSync(`${__dirname}/components/chat/ChatWorkspace.js`, "utf8");
const styles = fs.readFileSync(`${__dirname}/components/chat/chat.module.css`, "utf8");
const page = fs.readFileSync(`${__dirname}/pages/chat.js`, "utf8");
const app = fs.readFileSync(`${__dirname}/pages/_app.js`, "utf8");

for (const token of [
  "brotherInput",
  "anchorDraft",
  "addBrother",
  "confirmBrotherMessage",
  "copyDraft",
  "confirmSent",
  "editingMessageId",
  "beginEditMessage",
  "saveMessageEdit",
  "editMessageText",
  "修改",
  "已发送消息可修改",
  "handleOcrFile",
  "confirmOcrBlock",
  "confirmOcrBlocks",
  "导入截图识别",
  "左侧气泡自动归为大哥",
  "右侧气泡自动归为主播",
  "按截图顺序写入聊天",
  "ocrPreview",
  "generateOpening",
  "profileSources",
  "作品文案",
  "近期评论",
  "公开发言",
  "画像素材",
  "openingTopics",
  "早安问候",
  "大哥消息",
  "主播回复",
  "复制回复",
  "标记已发送",
  "放入输入框",
  "timelineRef",
  "showScrollToBottom",
  "scrollTimelineToBottom",
  "回到底部",
  "isNearBottom",
  "本轮判断依据",
  "runtimeAnalysis",
  "runtimeMemoryStatus",
  "updateRuntimeMemory",
]) {
  assert(component.includes(token), `聊天组件缺少契约：${token}`);
}
for (const token of ["@media (max-width: 600px)", "min-width: 0", "overflow-wrap: anywhere", "env(safe-area-inset-bottom)", "overscroll-behavior: contain", "scrollbar-gutter: stable", "height:calc(100dvh"] ) {
  assert(styles.includes(token), `手机样式缺少契约：${token}`);
}
assert(page.includes("ChatWorkspace"), "聊天页面必须渲染 ChatWorkspace");
assert(component.includes("/api/profile/"), "聊天组件必须调用现有 AI API");
assert(component.includes("consent: true"), "AI 请求必须显式带素材授权");
assert(component.includes("navigator.clipboard"), "复制回复必须使用剪贴板");
assert(component.includes("markSent"), "标记已发送必须通过领域状态迁移");
assert(!component.includes("sendToDouyin"), "第一阶段不得伪造抖音发送 API");
assert(component.includes("currentMessage: latestBrotherMessage.text"), "AI 请求必须使用已确认的大哥消息");
assert(component.includes("brotherId: scopedBrotherId"), "AI 请求必须携带当前维护对象唯一 ID");
assert(component.includes("setRuntimeAnalysis(nextRuntimeAnalysis)"), "聊天页必须保存 Runtime 分析结果");
assert(component.includes("/api/chat/runtime-memory/"), "聊天页必须读取对象级 Runtime 记忆状态");
assert(component.includes("history: historyPairs(activeMessages)"), "AI 请求必须使用已确认会话历史");
assert(component.includes("replyCount: 6"), "手机端候选应限制为 6 条以内");
assert(component.includes("setAnchorDraft(reply.text"), "候选只能进入主播回复输入框");
assert(component.includes("不连接抖音发送接口"), "界面必须明确工具不会调用抖音发送接口");
assert(component.includes("/api/ocr/"), "聊天组件必须调用截图 OCR API");
assert(component.includes("requiresConfirmation"), "OCR 结果必须先待主播确认");
assert(component.includes("imageWidth"), "OCR 请求必须携带截图宽度以判断左右气泡");
assert(component.includes("sender === \"unknown\""), "OCR 居中或缺少坐标时必须保留人工确认");
assert(component.includes("screenshot_ocr"), "截图识别确认后必须标记来源");
assert(component.includes("generationMode: \"opening\""), "日常开场必须走 opening AI 模式");
assert(component.includes("allowLiveInvite: true"), "日常开场必须显式请求安全的轻直播邀请候选");
assert(component.includes("sources: profileSources"), "AI 请求必须携带主播录入的画像素材");
assert(component.includes("profileSources.works"), "聊天页必须维护作品文案素材");
assert(component.includes("profileSources.comments"), "聊天页必须维护近期评论素材");
assert(component.includes("profileSources.statements"), "聊天页必须维护公开发言素材");
assert(component.includes("details"), "画像素材入口应默认折叠，避免挤占聊天主流程");
assert(component.includes("ENABLE_SCREENSHOT_OCR = false"), "截图识别入口当前必须由关闭开关控制");
assert(component.includes("ENABLE_SCREENSHOT_OCR &&"), "截图识别入口必须整体隐藏而不是只禁用按钮");
assert(app.includes("ThemeToggle"), "全局页面必须提供主题切换入口");

console.log("✅ 手机聊天页面契约测试通过");
