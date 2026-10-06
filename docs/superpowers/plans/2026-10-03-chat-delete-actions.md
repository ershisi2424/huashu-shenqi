# 聊天删除操作 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将聊天消息和维护对象的操作收敛为可确认的修改/删除，并保持主播账号数据隔离。

**Architecture:** 在现有聊天线程模型上增加删除领域操作和服务端 DELETE 路由。前端先做乐观删除并保留回滚快照，二次确认后再同步服务端；本地访客只修改当前作用域的会话快照。

**Tech Stack:** Next.js 16 Pages Router、React、CommonJS 领域模块、better-sqlite3、本地 Node 断言测试。

---

### Task 1: 消息删除领域行为

**Files:**
- Modify: `lib/chat-thread.cjs`
- Test: `test-chat-thread.cjs`

- [ ] **Step 1: Write the failing test**

为消息模型增加按 ID 删除并保持其他消息的测试，删除未知 ID 时保持原数组。

- [ ] **Step 2: Run test to verify it fails**

Run `node test-chat-thread.cjs`，预期提示删除函数不存在或断言失败。

- [ ] **Step 3: Write minimal implementation**

增加纯函数 `removeMessage(messages, messageId)`，只过滤目标 ID，不修改输入数组。

- [ ] **Step 4: Run test to verify it passes**

Run `node test-chat-thread.cjs`，预期通过。

### Task 2: 服务端删除接口与权限

**Files:**
- Modify: `lib/auth-store.cjs`
- Modify: `pages/api/chat/messages.js`
- Modify: `pages/api/chat/brothers.js`
- Create: `test-chat-delete-api.cjs`

- [ ] **Step 1: Write failing API/store tests**

覆盖主播删除自己的消息、删除不存在消息返回明确错误、运营只读拒绝；维护对象删除同时删除其消息和工作台关联数据，并且不能跨主播删除同名对象。

- [ ] **Step 2: Run `node test-chat-delete-api.cjs` and verify failure**

预期 DELETE 路由未实现或 store 方法不存在。

- [ ] **Step 3: Implement minimal store and route behavior**

增加 `deleteChatMessage` 和 `deleteChatBrother`，通过当前 actor 做访问控制；路由只接受 DELETE，返回 `{ item: { id } }` 或稳定错误码。

- [ ] **Step 4: Run API tests**

Run `node test-chat-delete-api.cjs`，预期通过。

### Task 3: 前端消息和对象删除交互

**Files:**
- Modify: `components/chat/ChatWorkspace.js`
- Modify: `components/chat/chat.module.css`
- Create: `test-chat-delete-ui.cjs`

- [ ] **Step 1: Write failing UI contract tests**

断言源码不再渲染收藏/置顶操作，存在消息删除和维护对象删除入口、二次确认文案、失败回滚提示。

- [ ] **Step 2: Run `node test-chat-delete-ui.cjs` and verify failure**

预期旧的收藏/置顶按钮仍存在且删除入口不存在。

- [ ] **Step 3: Implement UI and optimistic rollback**

复用现有消息编辑权限判断；删除前调用 `window.confirm`，保存快照后本地移除；服务端失败时恢复快照。维护对象删除同步清理当前 scope 下的本地数据并调用 DELETE API。

- [ ] **Step 4: Run UI contracts**

Run `node test-chat-delete-ui.cjs && node test-chat-selection-no-refresh.cjs`，预期通过。

### Task 4: 全量回归与构建

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Register new tests**

将新增测试加入 `npm test` 顺序，保证领域、API、UI 回归持续执行。

- [ ] **Step 2: Run full tests**

Run `npm test`，预期所有测试通过。

- [ ] **Step 3: Build isolated copy**

在 `/private/tmp/huashu-build` 运行 `npm run build`，预期 Next.js 编译和静态页面生成成功。
