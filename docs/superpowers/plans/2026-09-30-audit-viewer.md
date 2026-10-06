# 审计查看页实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为最高管理和运营提供服务端强制隔离的只读操作审计页，并在聊天操作记录中展开关联聊天正文。

**Architecture:** 保持 `audit_logs` 只存动作元数据，扩展 `auth-store` 在服务端按组织层级筛选审计记录，并通过 `metadata.messageId` 关联 `chat_messages` 返回正文。新增 `/api/ops/audit/` 游标分页接口，`AdminWorkspace` 只负责筛选、展开和加载更多，不在客户端自行拼接权限范围。

**Tech Stack:** Next.js pages API、React hooks、better-sqlite3、Node `assert`/VM API 测试、现有 CSS Modules。

---

### Task 1: 建立审计存储层 RED 测试

**Files:**
- Create: `test-audit-store.cjs`
- Modify: `package.json`（将测试加入 `npm test`）

- [x] **Step 1: 写失败测试，覆盖层级范围和正文关联契约**

在临时 SQLite 中创建两个运营、每个运营一个主播和一个维护对象；由主播追加一条大哥消息、由另一运营追加一条消息，然后断言：

```js
const all = store.listAuditLogs({ actor: admin, limit: 200 });
assert.ok(all.items.some((item) => item.chatMessage?.text === "晚上好"));
assert.ok(all.items.some((item) => item.chatMessage?.direction === "left"));

const firstOperator = store.listAuditLogs({ actor: operatorA, limit: 200 });
assert.ok(firstOperator.items.some((item) => item.actor?.id === anchorA.id));
assert.ok(firstOperator.items.some((item) => item.actor?.id === operatorA.id));
assert.ok(firstOperator.items.every((item) => item.actor?.id !== anchorB.id));

assert.throws(() => store.listAuditLogs({ actor: anchorA }), /AUDIT_ACCESS_DENIED/);
```

同时断言 `nextCursor` 能让第二页不重复第一条，`role: "anchor"` 和 `action: "chat.message.append"` 筛选只返回匹配记录，元数据中不出现 `password`、`token` 或 `secret` 键。

- [x] **Step 2: 运行单测确认 RED**

运行：`node test-audit-store.cjs`

预期：失败，提示 `store.listAuditLogs` 尚未返回 `{ items, nextCursor }` 或 `AUDIT_ACCESS_DENIED` 未实现。

- [x] **Step 3: 将测试脚本加入 `package.json`**

在 `scripts.test` 的串行测试列表中加入 `node test-audit-store.cjs`，不修改已有测试顺序之外的行为。

- [x] **Step 4: 提交测试基线**

```bash
git add test-audit-store.cjs package.json
git commit -m "test: define audit viewer storage contract"
```

### Task 2: 实现服务端审计查询和安全清洗

**Files:**
- Modify: `lib/auth-store.cjs`（替换现有 `listAuditLogs`，增加游标、组织范围、用户关联和消息正文关联）
- Test: `test-audit-store.cjs`

- [x] **Step 1: 增加固定的输入校验和游标辅助函数**

实现以下行为：`limit` 默认 50、范围 1–100；`cursor` 必须是 base64url JSON `{createdAt,id}`；`action` 只允许已有动作字符串；`role` 只允许 `super_admin|operator|anchor`；`from/to` 必须是可解析 ISO 日期且 `from <= to`，否则抛出 `AUDIT_QUERY_INVALID`。

- [x] **Step 2: 实现组织范围 SQL**

使用 `audit_logs l` 左连接操作者 `actor`、目标 `target`，并按角色构造参数化 WHERE：

```sql
-- super_admin
1 = 1

-- operator
(l.actor_user_id = ? OR actor.operator_id = ? OR target.operator_id = ?)
```

运营参数全部使用当前会话账号 ID；不得接受请求体或查询参数中的 actor ID。主播直接抛出 `AUDIT_ACCESS_DENIED`。

- [x] **Step 3: 实现关联数据和敏感字段清洗**

解析 `metadata` 失败时返回 `{}`；递归删除键名匹配 `password|token|secret|key|cookie` 的字段；通过 `metadata.messageId` 查询消息及维护对象昵称，返回 `chatMessage` 的方向、正文、状态、确认时间和发送时间。消息不存在时返回 `chatMessage: null`。

- [x] **Step 4: 实现稳定排序、下一游标和筛选**

按 `l.created_at DESC, l.id DESC` 查询，游标条件为：

```sql
l.created_at < ? OR (l.created_at = ? AND l.id < ?)
```

多取一条判断是否还有下一页，再把最后一条编码为 `nextCursor`；无下一页返回 `null`。

- [x] **Step 5: 运行存储测试确认 GREEN**

运行：`node test-audit-store.cjs`

预期：`test-audit-store: ok`。

### Task 3: 新增审计 API 和 API 权限测试

**Files:**
- Create: `pages/api/ops/audit.js`
- Create: `test-audit-api.cjs`
- Modify: `package.json`（将 API 测试加入 `npm test`）

- [x] **Step 1: 写 API RED 测试**

沿用 `test-server-chat-api.cjs` 的 VM handler 加载方式，创建管理员、两个运营和两个主播，分别创建会话；断言：

```js
assert.equal((await call(audit, { cookie: adminCookie })).status, 200);
assert.equal((await call(audit, { cookie: operatorCookie })).status, 200);
assert.equal((await call(audit, { cookie: anchorCookie })).status, 403);
assert.equal((await call(audit)).status, 401);
assert.equal((await call(audit, { cookie: operatorCookie, query: { limit: "bad" } })).status, 400);
```

并验证运营响应中包含自己主播的正文但不包含另一运营主播的消息。

- [x] **Step 2: 运行测试确认 RED**

运行：`node test-audit-api.cjs`

预期：因 `pages/api/ops/audit.js` 不存在而失败。

- [x] **Step 3: 实现 GET handler**

`pages/api/ops/audit.js` 使用 `requireUser(req, res, ["operator", "super_admin"])`；只接受 GET；读取 `limit/cursor/action/role/from/to`，调用 `getAuthStore().listAuditLogs({ actor, ... })`。将 `AUDIT_QUERY_INVALID` 映射为 400，将 `AUDIT_ACCESS_DENIED` 映射为 403，其余错误只记录动作名并返回通用 500。

- [x] **Step 4: 运行 API 测试确认 GREEN**

运行：`node test-audit-api.cjs`，预期 `test-audit-api: ok`；再运行 `npm test`，预期所有既有测试通过。

- [x] **Step 5: 提交存储层和 API**

```bash
git add lib/auth-store.cjs pages/api/ops/audit.js test-audit-store.cjs test-audit-api.cjs package.json
git commit -m "feat: add scoped audit api with chat bodies"
```

### Task 4: 接入运营后台只读审计界面

**Files:**
- Modify: `components/admin/AdminWorkspace.js`
- Modify: `components/admin/admin.module.css`
- Modify: `test-admin-ui.cjs`

- [x] **Step 1: 写 UI 契约 RED 断言**

在 `test-admin-ui.cjs` 中增加字符串契约：`/api/ops/audit/`、`操作审计`、`加载更多`、`展开聊天正文`、`chatMessage.text`、角色和动作筛选控件必须存在；同时断言不存在发送/删除审计记录的按钮文案。

- [x] **Step 2: 增加审计状态和加载函数**

在 `AdminWorkspace` 增加 `auditItems`、`auditCursor`、`auditFilters`、`auditLoading`、`auditError`、`expandedAuditId`；首次 `load()` 成功后调用 `loadAudit({ reset: true })`。筛选变化重置游标；“加载更多”使用返回的 `nextCursor` 追加，不重复已有 ID。

- [x] **Step 3: 实现审计筛选和时间线渲染**

增加角色、动作、开始/结束日期控件和“查询”按钮；每条卡片渲染时间、操作者、角色、目标、维护对象、动作和元数据。`chatMessage` 存在时渲染按钮“展开聊天正文”，展开内容明确显示“大哥（左侧）”或“主播（右侧）”、正文、确认/发送状态；正文使用普通 React 文本节点。

- [x] **Step 4: 增加移动端样式和状态反馈**

在 `admin.module.css` 增加审计筛选网格、时间线卡片、正文气泡、展开按钮、加载更多和空态样式；在 700px/430px 断点下改为单列并保证按钮触控高度至少 32px。

- [x] **Step 5: 运行 UI 契约和生产构建**

运行：`node test-admin-ui.cjs`、`npm run build`、`git diff --check`；预期全部成功。

### Task 5: 运行态验收和回归

**Files:**
- Modify: `docs/superpowers/plans/2026-09-30-audit-viewer.md`（勾选完成项并记录证据）
- Modify: `progress.md`（追加阶段结果）

- [x] **Step 1: 检查 3102 服务并登录验证**

使用当前超级管理员会话请求 `/api/ops/audit/`，确认 HTTP 200、返回至少一条 `auth.login` 或 `bootstrap.admin.create` 记录，并确认返回体没有 `password_hash`、`session` 或 `token` 字段。

- [x] **Step 2: 验证前端页面**

打开 `http://127.0.0.1:3102/admin/`，确认“操作审计”区域、筛选控件和聊天正文展开正常；移动宽度下页面不出现横向溢出。

- [x] **Step 3: 完整回归**

运行：`npm test && npm run build && git diff --check`。

- [x] **Step 4: 更新计划和进度证据**

将所有任务勾选为完成，记录测试、构建、接口状态和任何未验证的真实环境边界；不把“页面能打开”写成已完成的权限验收，必须保留 HTTP/API 证据。

- [x] **Step 5: 提交实现**

```bash
git add lib/auth-store.cjs pages/api/ops/audit.js components/admin/AdminWorkspace.js components/admin/admin.module.css test-audit-store.cjs test-audit-api.cjs test-admin-ui.cjs package.json docs/superpowers/plans/2026-09-30-audit-viewer.md progress.md
git commit -m "feat: add scoped audit viewer"
```
