# 聊天画像素材输入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让主播在聊天页输入授权的作品、评论和公开发言素材，并将其随当前消息和历史送入现有 GLM-5.3 画像回复链路。

**Architecture:** 前端在 `ChatWorkspace` 中维护一个可选的 `profileSources` 对象，并把它写入本地/服务端工作台快照；服务端画像 API 复用已有 `works/comments/statements` 字段与 goutoujunshi 分析，不改 Provider 和回复 Schema。

**Tech Stack:** Next.js Pages Router、React hooks、Node.js CommonJS 测试契约、SQLite 快照 JSON。

---

### Task 1: 建立素材输入与请求契约

**Files:**
- Modify: `test-chat-ui.cjs`
- Modify: `test-api.cjs`
- Test: `node test-chat-ui.cjs`, `node test-api.cjs`

- [ ] **Step 1: Write failing contract assertions**

断言聊天组件包含 `profileSources`、三个素材字段、折叠入口和请求体 `sources`；API 测试断言素材进入 `relationshipState.facts/evidence`。

- [ ] **Step 2: Run tests and verify the new assertions fail**

Run: `node test-chat-ui.cjs && node test-api.cjs`
Expected: `test-chat-ui.cjs` fails because the source input contract is absent.

### Task 2: 接入聊天页面和快照

**Files:**
- Modify: `components/chat/ChatWorkspace.js`
- Modify: `lib/chat-local-store.cjs`
- Modify: `pages/api/chat/workspace-snapshots.js`
- Modify: `test-chat-local-store.cjs`
- Modify: `test-server-chat-api.cjs`

- [ ] **Step 1: Add `profileSources` state and default empty values**
- [ ] **Step 2: Add a collapsed `<details>` editor with works/comments/statements fields**
- [ ] **Step 3: Include sources in profile requests and both snapshot directions**
- [ ] **Step 4: Run focused tests and verify they pass**

### Task 3: Regression and production verification

**Files:**
- Modify: `progress.md`
- Modify: `task_plan.md`

- [ ] **Step 1: Run `npm test`**
- [ ] **Step 2: Run an isolated copy `npm run build` without `.env.local` or `.next`**
- [ ] **Step 3: Run `git diff --check` and update progress evidence**
