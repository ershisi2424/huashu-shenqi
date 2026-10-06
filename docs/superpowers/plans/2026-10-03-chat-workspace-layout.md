# 固定版聊天工作台排布 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with checkpoints.

**Goal:** 将主播维护界面固定为“顶部关系信息—中部聊天—底部回复处理”的单向操作工作台。

**Architecture:** 保留现有 `ChatWorkspace` 状态、API 调用和权限边界，只重排 JSX 区块并新增语义化布局类。维护对象列表继续作为桌面左栏/手机横向列表；当前大哥关系信息放入主工作台顶部；聊天记录独占中段；主播回复输入、AI 候选、候选历史和发送确认合并为底部回复工作区。响应式 CSS 使用桌面、平板、手机三个层级，禁止回复候选依赖固定高度裁切。

**Tech Stack:** Next.js Pages Router、React 19、CSS Modules、Node.js contract tests、Playwright/Codex 浏览器截图复核。

---

### Task 1: 建立固定排布回归契约

**Files:**
- Modify: `test-chat-ui.cjs`
- Test: `test-chat-ui.cjs`

- [x] **Step 1: 写失败断言**

在现有聊天 UI 契约中加入以下断言，确保生产组件包含新的分区标识，样式包含新的布局类：

```js
for (const token of ["relationshipDock", "replyWorkspace", "aiCandidateShelf", "relationshipHeader"]) {
  assert(component.includes(token), `聊天组件缺少固定排布区域：${token}`);
}
for (const token of [".relationshipDock", ".replyWorkspace", ".aiCandidateShelf", ".relationshipHeader"]) {
  assert(styles.includes(token), `聊天样式缺少固定排布区域：${token}`);
}
```

- [x] **Step 2: 运行定向测试确认失败**

Run: `node test-chat-ui.cjs`

Expected: FAIL，提示缺少 `relationshipDock` 或其他新布局区域。

### Task 2: 重排 ChatWorkspace 主结构

**Files:**
- Modify: `components/chat/ChatWorkspace.js:1205-1365`
- Test: `test-chat-ui.cjs`

- [x] **Step 1: 固定三段主结构**

把当前 `<main className={styles.chat}>` 改为以下层级，并保留现有事件处理和状态变量：

```jsx
<main className={styles.chat}>
  <div className={styles.chatHeader}>当前大哥身份和主播确认状态</div>
  <section className={styles.relationshipDock} aria-label="大哥关系资料">
    <div className={styles.relationshipHeader}>画像摘要、任务、时间线、本轮判断依据</div>
    <div className={styles.relationshipBody}>现有画像素材、runtime、任务、时间线、运营备注 details</div>
  </section>
  <div className={styles.timeline}>现有左右聊天气泡和回到底部</div>
  <section className={styles.replyWorkspace} aria-label="主播回复工作区">
    <div className={styles.replyComposer}>大哥消息录入、主播回复输入、发送前检查、开场按钮和发送确认</div>
    <section className={styles.aiCandidateShelf} aria-label="AI 回复候选">AI 风格、状态、候选卡片</section>
    <details className={styles.replyHistory}>现有回复历史</details>
  </section>
</main>
```

画像素材 `profileSourcePanel` 从 composer 移到 `relationshipDock`；`taskCard`、`runtimePanel`、`relationshipTimeline`、`operatorNotes` 和 `profilePanel` 从旧 `aiPanel` 移到顶部关系区。`replyStyleControl`、错误/提示、`replyList` 和回复历史留在底部回复工作区。

- [x] **Step 2: 保留候选选择行为**

候选按钮继续执行现有逻辑：

```jsx
onClick={() => {
  markWorkspaceTouched();
  setAnchorDraft(reply.text || "");
  setNotice("候选已放入主播回复输入框，可继续修改");
}}
```

不得调用 `markSent`、不得写入聊天消息、不得连接抖音发送接口。

- [x] **Step 3: 运行 UI 契约测试**

Run: `node test-chat-ui.cjs && node test-chat-candidate-persistence.cjs && node test-chat-enhancements-ui.cjs`

Expected: PASS。

### Task 3: 重做固定排布与响应式样式

**Files:**
- Modify: `components/chat/chat.module.css`
- Test: `test-chat-reply-responsive.cjs`

- [x] **Step 1: 设置桌面主列层级**

追加语义化样式：主布局仍保留左侧维护对象列表；`.chat` 改成 `display:flex; flex-direction:column; min-height:0`；`.relationshipDock` 位于顶部且限制高度；`.timeline` 使用 `flex:1` 和独立滚动；`.replyWorkspace` 使用 `flex:0 0 auto`，内部不覆盖聊天正文。

- [x] **Step 2: 设置 AI 候选 shelf**

让 `.aiCandidateShelf` 与主播回复输入框属于同一个视觉区，使用明确分隔线和标题；`.aiCandidateShelf .replyList` 在桌面最多两列，在手机单列，并设置 `max-height:none; overflow:visible`，避免再次裁切。

- [x] **Step 3: 设置关系区和手机端折叠体验**

关系区默认以摘要行展示，详细内容通过 `<details>` 展开；手机端 `.relationshipDock` 放在聊天标题下方，`relationshipBody` 纵向排列，主要按钮最小高度 36px，页面禁止横向溢出。

- [x] **Step 4: 运行响应式测试**

Run: `node test-chat-reply-responsive.cjs`

Expected: PASS，并断言关系区、回复区、候选 shelf 在 601–900px 和 600px 断点均取消固定高度裁切。

### Task 4: 浏览器截图复核和回归

**Files:**
- Modify: `findings.md`
- Modify: `progress.md`

- [x] **Step 1: 运行完整测试和差异检查**

Run: `npm test && git diff --check`

Expected: 全部测试退出码 0，差异检查无输出。

- [x] **Step 2: 运行隔离生产构建**

复制依赖到 `/private/tmp/huashu-chat-layout-build-*` 后运行 `npm run build`，避免当前 3102 开发服务占用 `.next`。

Expected: Next.js 编译、静态页面生成和 API route 收集全部成功。

- [x] **Step 3: 浏览器验证三种宽度**

在 3102 当前登录会话中分别验证桌面、平板、手机视口：

1. 顶部能看到大哥关系摘要入口；
2. 中部只出现聊天气泡；
3. 底部出现主播回复输入框和 AI 候选；
4. 点击候选后输入框填入文本，聊天记录不新增气泡；
5. 页面无横向溢出，候选卡片完整可见。

- [x] **Step 4: 更新记录**

将实际截图、测试结果、构建结果和若有的环境限制写入 `findings.md`、`progress.md`，不要把外部 API 成功与本地 UI 验证混为一谈。
