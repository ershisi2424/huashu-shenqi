const assert = require("node:assert/strict");
const fs = require("node:fs");

const component = fs.readFileSync(`${__dirname}/components/chat/ChatWorkspace.js`, "utf8");
const styles = fs.readFileSync(`${__dirname}/components/chat/chat.module.css`, "utf8");
const page = fs.readFileSync(`${__dirname}/pages/chat.js`, "utf8");
const app = fs.readFileSync(`${__dirname}/pages/_app.js`, "utf8");

const authActions = component.match(/<div className=\{styles\.authGateActions\}>([\s\S]*?)<\/div>/)?.[1];
assert(authActions, "管理账号入口的两个按钮必须分组，避免紧贴");
assert.equal((authActions.match(/<button /g) || []).length, 2, "按钮组应只包含进入后台和退出操作");
assert(authActions.includes("进入运营后台") && authActions.includes("onClick={logout}"), "按钮分组不能改变后台入口或退出操作");
const authActionStyles = styles.match(/\.authGateActions\s*\{([^}]+)\}/)?.[1] || "";
assert.match(authActionStyles, /display:\s*flex/, "入口按钮应使用独立 flex 布局");
assert.match(authActionStyles, /gap:\s*var\(--auth-action-gap\)/, "入口按钮应使用明确间距");
assert.match(authActionStyles, /--auth-action-gap:\s*12px/, "入口按钮间距应为 12px");
assert.match(authActionStyles, /flex-wrap:\s*wrap/, "窄屏下按钮应可换行，避免挤压");

for (const token of ["relationshipDock", "replyWorkspace", "aiCandidateShelf", "relationshipHeader"]) {
  assert(component.includes(token), `聊天组件缺少固定排布区域：${token}`);
}
for (const token of [".relationshipDock", ".replyWorkspace", ".aiCandidateShelf", ".relationshipHeader"]) {
  assert(styles.includes(token), `聊天样式缺少固定排布区域：${token}`);
}
assert(component.includes("relationshipIdentity") && component.includes("relationshipActions"), "关系资料头部必须承载对象身份和状态操作");
assert(!component.includes('<div className={styles.chatHeader}>'), "聊天标题栏与关系资料摘要重复，必须合并为单一头部");
for (const token of [".relationshipIdentity", ".relationshipActions"]) {
  assert(styles.includes(token), `合并后的关系资料头部缺少样式：${token}`);
}

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
  "taskSuggestionEnabled",
  "采用这条建议参与本轮 AI 生成",
  "maintenanceTaskMode",
  "maintenanceTask",
  "errorScope",
  "isCurrentError",
  "visibleError",
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
assert(!component.includes("sentConfirmation"), "标记已发送不应再要求额外勾选确认");
assert(!component.includes("我已在抖音实际发送"), "聊天回复区不应显示繁琐的实际发送勾选项");
assert(component.includes('disabled={!anchorDraft.trim()}'), "有主播回复草稿时应可直接标记已发送");
assert(!component.includes('disabled={!sentConfirmation || !anchorDraft.trim()}'), "标记已发送不能继续绑定已移除的确认勾选框");
assert(!component.includes("sendToDouyin"), "第一阶段不得伪造抖音发送 API");
assert(!component.includes("data-platform-boundary"), "聊天页不应显示常驻的平台边界提示条");
assert(component.includes("const targetMessage = replyTargetMessage || latestBrotherMessage"), "AI 请求必须使用已确认或手动选中的大哥消息");
assert(component.includes("selectedBrotherMessageId"), "聊天页必须保存主播本轮选中的大哥消息");
assert(component.includes("pickReplyTarget"), "AI 回复必须通过统一目标选择器决定本轮分析消息");
assert(component.includes("针对这条回复"), "左侧大哥消息必须提供专项回复入口");
assert(component.includes("replyTargetMessage.text"), "专项回复请求必须使用被选中的大哥消息正文");
assert(component.includes("sourceMessageId = replyTargetMessage?.id"), "候选重试保存时必须继续绑定当前专项回复目标");
assert(component.includes("brotherId: scopedBrotherId"), "AI 请求必须携带当前维护对象唯一 ID");
assert(component.includes('return serverId || "";'), "登录态服务端对象同步失败时不得回退到本地对象 ID");
assert(!component.includes("return serverId || brother.id;"), "运行时作用域不得把本地对象 ID 当成服务端对象 ID");
assert(component.includes("setRuntimeAnalysis(nextRuntimeAnalysis)"), "聊天页必须保存 Runtime 分析结果");
assert(component.includes("/api/chat/runtime-memory/"), "聊天页必须读取对象级 Runtime 记忆状态");
assert(component.includes("history: historyPairs(activeMessages)"), "AI 请求必须使用已确认会话历史");
assert(component.includes("replyCount: 6"), "手机端候选应限制为 6 条以内");
assert(component.includes("setAnchorDraft(reply.text"), "候选只能进入主播回复输入框");
assert(!component.includes("不连接抖音发送接口"), "聊天页不应显示常驻的平台边界提示条");
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
assert(component.includes("const { SCREENSHOT_OCR_ENABLED } = ocrFeature"), "截图识别入口当前必须读取统一关闭开关");
assert(component.includes("ENABLE_SCREENSHOT_OCR &&"), "截图识别入口必须整体隐藏而不是只禁用按钮");
assert(app.includes("ThemeToggle"), "全局页面必须提供主题切换入口");

console.log("✅ 手机聊天页面契约测试通过");
