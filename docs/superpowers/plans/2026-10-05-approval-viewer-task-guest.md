# 审批、只读工作台、任务创建与游客临时工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复跨账号缓存和审批队列丢失问题，复用已登录管理会话进入授权主播只读工作台，增加按权限创建维护任务，并提供隔离的手机号游客临时工作台。

**Architecture:** 认证 API、审批/聊天/任务 API 统一返回私有 `no-store` 响应，Service Worker 永不缓存 `/api/`。正式账号继续使用 `hh_session` 和 SQLite 正式表；游客使用独立 `guest_accounts`/`guest_sessions`，只把游客身份用于 AI 请求和前端本地临时工作区，不进入正式聊天数据表或正式管理范围。任务创建复用现有 `maintenance_tasks`，以 `source_message_id = NULL` 区分人工任务。

**Tech Stack:** Next.js Pages Router 16、React 19、better-sqlite3、Node `assert` 契约测试、原生 Service Worker。

---

## 文件结构与职责

- Modify: `public/sw.js` — 排除 `/api/` 缓存并升级缓存版本。
- Modify: `lib/auth-session.cjs` — 增加私有响应头、游客 Cookie/token 读写和正式/游客身份辅助函数。
- Modify: `lib/auth-store.cjs` — 增加游客账户/会话表、清理/触碰活动、人工任务创建；正式查询过滤游客记录。
- Create: `pages/api/auth/guest-login.js` — 手机号游客登录。
- Create: `pages/api/auth/guest-me.js` — 游客会话查询。
- Modify: `pages/api/auth/logout.js` — 同时撤销正式和游客会话。
- Modify: `pages/api/auth/me.js` — 只报告正式用户；游客由 guest-me 查询，避免角色混淆。
- Modify: `pages/api/auth/approvals.js`、`pages/api/auth/anchor-approvals.js`、`pages/api/chat/*.js`、`pages/api/ops/*.js`、`pages/api/profile.js` — 私有 no-store 和游客/正式权限边界。
- Modify: `components/admin/ApprovalCenter.js` — 独立加载运营/主播队列，错误不互相覆盖。
- Modify: `components/chat/ReadonlyAnchorWorkspace.js` — 等待会话检查后再取快照，区分 401/403。
- Modify: `components/tasks/MaintenanceTaskWorkspace.js` — 新增任务表单和对象选择。
- Modify: `components/auth/LoginWorkspace.js` — 增加游客手机号登录入口。
- Modify: `components/chat/ChatWorkspace.js` — 识别游客工作区，跳过正式服务端同步并允许 AI 请求使用游客会话。
- Create: `test-service-worker.cjs` — API 不缓存契约。
- Create: `test-approval-isolation.cjs` — 审批队列独立加载契约。
- Create: `test-viewer-session.cjs` — 已登录只读和未登录/越权行为。
- Modify: `test-maintenance-task-store.cjs`、`test-maintenance-task-api.cjs` — POST 任务红绿测试。
- Create: `test-guest-auth.cjs` — 游客登录、注销、过期清理和正式数据隔离。
- Modify: `test-auth-api.cjs`、`test-readonly-workspace-ui.cjs`、`test-chat-auth-state.cjs` — 回归角色/会话契约。
- Modify: `package.json` — 将新测试加入 `npm test`。
- Modify: `task_plan.md`、`progress.md`、`findings.md` — 持久化阶段与证据。

### Task 1: 锁定跨账号缓存和审批队列回归

**Files:**
- Create: `test-service-worker.cjs`
- Create: `test-approval-isolation.cjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing tests**

`test-service-worker.cjs` 读取 `public/sw.js`，断言出现 API 直接放行条件、没有对 `/api/` 使用 cache-first；`test-approval-isolation.cjs` 读取 `ApprovalCenter.js`，断言运营队列和主播队列存在独立状态/独立错误标识，而不是只有单一 `Promise.all` 结果。

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test-service-worker.cjs && node test-approval-isolation.cjs`

Expected: `test-service-worker` 因当前 Service Worker 对所有 GET cache-first 失败；`test-approval-isolation` 因当前只有统一 `loading/error` 和 `Promise.all` 失败。

- [ ] **Step 3: Add test scripts to the full suite**

在 `package.json` 的 `test` 链中加入：

```json
"node test-service-worker.cjs && node test-approval-isolation.cjs &&"
```

- [ ] **Step 4: Re-run the failing tests**

Run: `node test-service-worker.cjs; node test-approval-isolation.cjs`

Expected: 两个测试仍按预期失败，证明测试捕获的是现有缺陷。

### Task 2: 修复 API 缓存和审批队列独立加载

**Files:**
- Modify: `public/sw.js`
- Modify: `lib/auth-session.cjs`
- Modify: `pages/api/auth/me.js`
- Modify: `pages/api/auth/approvals.js`
- Modify: `pages/api/auth/anchor-approvals.js`
- Modify: `components/admin/ApprovalCenter.js`
- Test: `test-service-worker.cjs`, `test-approval-isolation.cjs`

- [ ] **Step 1: Implement the Service Worker API bypass**

在同源判断后、HTML 分支前加入：

```js
if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return;
```

将版本升级到 `v1.0.3-private-api`。`activate` 现有旧缓存删除逻辑负责清理 `static-*`/`runtime-*` 旧版本；API 不再写入 runtime cache。

- [ ] **Step 2: Add the private response helper**

在 `lib/auth-session.cjs` 增加：

```js
function setPrivateNoStore(res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
}
```

在 `requireUser`、`getCurrentUser` 使用的 API 入口和审批/聊天私有 handler 开始处调用；客户端认证 GET 使用 `{ cache: "no-store" }`。

- [ ] **Step 3: Split ApprovalCenter loading**

为运营和主播队列分别维护 `operatorLoading/operatorError`、`anchorLoading/anchorError`；最高管理员使用两个独立请求函数，单个失败只更新对应队列，成功响应立即 `setItems`/`setAnchorItems`。运营分支只加载主播队列。按钮操作后重新加载对应队列。

- [ ] **Step 4: Run focused tests**

Run: `node test-service-worker.cjs && node test-approval-isolation.cjs && node test-auth-api.cjs`

Expected: all exit 0; `test-auth-api` 仍确认普通运营请求 `/api/auth/approvals/` 返回 403。

### Task 3: 修复已登录只读工作台会话竞态

**Files:**
- Modify: `components/chat/ReadonlyAnchorWorkspace.js`
- Modify: `pages/api/chat/workspace-snapshots.js`
- Create: `test-viewer-session.cjs`
- Modify: `test-readonly-workspace-ui.cjs`

- [ ] **Step 1: Write failing session behavior test**

使用临时 SQLite 创建两个运营和各自主播，调用快照 API：当前运营 Cookie 读取所属主播返回 200，跨运营返回 403，无 Cookie 返回 401；同时静态契约要求 viewer 先完成 `/api/auth/me/` 再请求快照。

- [ ] **Step 2: Run the test**

Run: `node test-viewer-session.cjs`

Expected: API 范围已有部分通过；UI 顺序契约因当前两个 `useEffect` 并行失败，证明竞态存在。

- [ ] **Step 3: Change viewer load order**

将 viewer 的认证和快照合并到同一个 effect：

```js
const meResponse = await fetch(`${basePath}/api/auth/me/`, { cache: "no-store" });
if (!meResponse.ok) throw Object.assign(new Error("当前登录已失效"), { status: 401 });
const me = await meResponse.json();
if (!['operator', 'super_admin'].includes(me.user?.role)) throw Object.assign(new Error("当前账号无权查看主播工作台"), { status: 403 });
const response = await fetch(snapshotUrl, { cache: "no-store" });
```

401 显示会话失效并提供登录链接；403 留在当前页显示无权，不跳登录。

- [ ] **Step 4: Run focused viewer tests**

Run: `node test-viewer-session.cjs && node test-readonly-workspace-ui.cjs`

Expected: both pass。

### Task 4: 增加人工维护任务 POST

**Files:**
- Create: `test-maintenance-task-create.cjs`
- Modify: `lib/auth-store.cjs`
- Modify: `pages/api/chat/tasks.js`
- Modify: `components/tasks/MaintenanceTaskWorkspace.js`
- Modify: `test-maintenance-task-store.cjs`, `test-maintenance-task-api.cjs`, `test-maintenance-task-ui.cjs`, `package.json`

- [ ] **Step 1: Write the failing store/API/UI tests**

断言主播、所属运营和最高管理员可以为授权对象创建 `follow_up` 手工任务；无关运营、未授权对象返回 `TASK_ACCESS_DENIED`；人工任务 `sourceMessageId === null`；POST 成功返回 201，缺少标题返回 400，旧 PATCH 只读行为不回归；UI 必须包含新增任务表单和对象选择。

- [ ] **Step 2: Run tests to verify red**

Run: `node test-maintenance-task-create.cjs; node test-maintenance-task-api.cjs; node test-maintenance-task-ui.cjs`

Expected: store 方法不存在或 API 返回 405，UI 缺少表单。

- [ ] **Step 3: Implement store creation**

在 `lib/auth-store.cjs` 增加 `createMaintenanceTask({ actor, brotherId, type = "follow_up", priority = "normal", title, reason = "", nextAction = "", dueAt = null })`：调用 `chatBrotherForActor`；仅允许 `anchor/operator/super_admin`；保留 brother 的 `owner_user_id/operator_id`；使用 `normalizeTask` 校验字段；插入 `status='follow_up'` 且 `source_message_id=NULL`；写入 `chat.task.create` 审计并返回映射任务。将方法暴露到返回对象。

- [ ] **Step 4: Implement API POST and form**

`pages/api/chat/tasks.js` 增加 POST，校验 body 后调用 store，返回 201；把 `TASK_ACCESS_DENIED` 映射 403、`TASK_*_INVALID` 映射 400。任务中心加载可见维护对象，表单字段为对象、标题、下一步、原因、优先级、提醒时间；提交后清空表单、刷新列表并显示状态。

- [ ] **Step 5: Run task tests**

Run: `node test-maintenance-task-create.cjs && node test-maintenance-task-store.cjs && node test-maintenance-task-api.cjs && node test-maintenance-task-ui.cjs`

Expected: all exit 0。

### Task 5: 游客独立会话和 24 小时清理

**Files:**
- Create: `test-guest-auth.cjs`
- Modify: `lib/auth-store.cjs`
- Modify: `lib/auth-session.cjs`
- Create: `pages/api/auth/guest-login.js`
- Create: `pages/api/auth/guest-me.js`
- Modify: `pages/api/auth/logout.js`
- Modify: `package.json`

- [ ] **Step 1: Write failing guest tests**

断言手机号 guest login 返回匿名 guest id 和 `hh_guest_session`，不写入正式 users；重复/不同手机号得到不同 guest id；guest session 可 touch；logout 后 session 无效；把 `last_seen_at` 调整到 24 小时前后 cleanup 删除 guest 记录；正式用户和聊天记录仍在；游客不能调用正式只读主播快照。

- [ ] **Step 2: Run guest tests to verify red**

Run: `node test-guest-auth.cjs`

Expected: guest store/API 文件不存在或返回 404。

- [ ] **Step 3: Add guest tables and store methods**

在 `createAuthStore` schema 增加 `guest_accounts`（`id, phone_hmac, created_at, last_seen_at, logged_out_at, expires_at`）和 `guest_sessions`（`token_hash, guest_id, created_at, last_seen_at, expires_at, revoked_at`），增加索引。实现 `createGuestSession(phone)`, `getGuestSession(token)`, `touchGuestSession(token)`, `revokeGuestSession(token)`, `cleanupGuestData(now = Date.now())`；手机号只用服务端 secret HMAC，缺少 secret 时使用部署级随机密钥并记录一次配置错误，不保存明文。

- [ ] **Step 4: Add guest session helpers and APIs**

在 `auth-session.cjs` 增加 `readGuestSessionToken`, `setGuestSessionCookie`, `clearGuestSessionCookie`, `getCurrentGuest` 和 `requireGuest`。新增 guest-login/guest-me；logout 根据两个 Cookie 分别撤销。游客接口设置 `Cache-Control: private, no-store`，不把 HMAC 或手机号返回给客户端。

- [ ] **Step 5: Run guest focused tests**

Run: `node test-guest-auth.cjs`

Expected: all guest session/cleanup/isolation assertions pass。

### Task 6: 将游客接入普通聊天和 AI 候选链路

**Files:**
- Modify: `components/auth/LoginWorkspace.js`
- Modify: `components/chat/ChatWorkspace.js`
- Modify: `pages/api/auth/me.js`
- Modify: `pages/api/profile.js`
- Modify: `test-chat-auth-state.cjs`
- Create: `test-guest-chat-ui.cjs`

- [ ] **Step 1: Write failing guest UI/API tests**

断言登录页存在手机号游客入口；ChatWorkspace 能识别 `role='guest'`，不调用 `/api/chat/brothers/`、`/api/chat/messages/`、正式快照/任务接口；profile 请求在游客会话下允许无 `brotherId/sourceMessageId` 的当前消息+本地历史；游客不能提交正式对象 ID。

- [ ] **Step 2: Run tests to verify red**

Run: `node test-guest-chat-ui.cjs; node test-chat-auth-state.cjs`

Expected: guest mode tokens和 profile guest 分支不存在。

- [ ] **Step 3: Add guest login UX and auth bootstrap**

`LoginWorkspace` 新增 `guestLogin` mode，只显示手机号和“进入临时工作台”；成功后跳回安全的 `returnTo`。ChatWorkspace 首先请求正式 `/api/auth/me`，失败后请求 `/api/auth/guest-me`；guest 使用 `guest:<id>` localStorage scope，不复用旧 `guest` 全局 key。

- [ ] **Step 4: Keep guest data local and allow AI**

ChatWorkspace 对 guest 跳过正式 server sync、正式任务/时间线/运营备注 API，但保留本地新增对象、编辑消息和回复候选。生成 AI 时不发送 `brotherId`、`sourceMessageId` 或正式快照，只发送当前消息、游客本地历史和授权素材；`pages/api/profile.js` 用 `getCurrentGuest(req)` 作为临时 actor，跳过正式聊天范围查询和正式 usage/audit 写入，仍执行 goutoujunshi Runtime 与 GLM-5.3 安全校验。

- [ ] **Step 5: Run guest chat tests**

Run: `node test-guest-chat-ui.cjs && node test-chat-auth-state.cjs && node test-chat-ui.cjs`

Expected: all exit 0，且正式主播工作区行为不变。

### Task 7: 全量回归、构建和运行时验证

**Files:**
- Modify: `task_plan.md`
- Modify: `progress.md`
- Modify: `findings.md`

- [ ] **Step 1: Run focused tests and record evidence**

Run: `node test-service-worker.cjs && node test-approval-isolation.cjs && node test-viewer-session.cjs && node test-maintenance-task-create.cjs && node test-guest-auth.cjs && node test-guest-chat-ui.cjs`。

- [ ] **Step 2: Run full regression**

Run: `npm test`

Expected: exit 0；若失败，记录完整命令和首个根因，不跳过既有测试。

- [ ] **Step 3: Run isolated production build**

复制当前依赖到可写临时目录，执行 `npm run build`，避免正在运行的 3102 服务锁定当前 `.next`；记录退出码和生成路由。

- [ ] **Step 4: Run diff/build checks**

Run: `git diff --check`；检查不出现明文手机号、guest token、API Key、密码日志。

- [ ] **Step 5: Browser verification**

在 3102 上刷新 Service Worker 后验证：管理员身份正确、运营待办不消失、点击授权主播不二次登录、跨运营被拒绝、任务可新增、游客进入空白临时工作台并生成候选。匿名直接访问 viewer 必须回到会话失效提示。

- [ ] **Step 6: Update planning evidence**

在 `task_plan.md` 标记已完成阶段，在 `progress.md` 写命令、退出码和未验证的外部 AI/Windows 部署边界；在 `findings.md` 记录任何剩余限制。
