# 后台三页与主播只读工作台实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将后台拆为审批、操作日志、用户管理三页，并让授权运营/最高管理员查看主播最新草稿、AI 候选和完整已同步聊天内容。

**Architecture:** 先在 `auth-store` 建立用户状态统计、删除保护和工作台快照存储，再以服务端会话权限提供分组审计和只读工作台接口。前端将 `/admin` 收敛为审批中心，新增 `/admin/audit`、`/admin/users`，主播聊天组件通过明确的只读模式复用展示结构但完全移除写调用。

**Tech Stack:** Next.js Pages API、React 19、better-sqlite3、SQLite 事务、CSS Modules、Node assert/VM API 契约测试。

---

### Task 1：用户状态和删除存储契约（TDD）

**Files:**
- Create: `test-user-management-store.cjs`
- Modify: `lib/auth-store.cjs`
- Modify: `package.json`

- [ ] 写 RED 测试：创建两个运营、两个主播和聊天数据；断言 `listUserUsage` 返回角色/状态/最近登录/最近操作/会话/维护对象/消息/快照统计；停用撤销会话但保留数据；恢复后可登录；删除清理用户数据但保留脱敏审计；最后一个超级管理员和当前管理员删除失败。
- [ ] 运行 `node test-user-management-store.cjs`，确认因方法不存在或状态动作未实现而失败。
- [ ] 增加 `listUserUsage`、`changeUserStatus`、`prepareUserDeletion`、`confirmUserDeletion`；使用事务和 `actor_snapshot_json`/`target_snapshot_json` 字段保存脱敏快照；删除前生成短时确认记录。
- [ ] 运行测试至 `test-user-management-store: ok`，再运行 `node test-auth-store.cjs` 和 `node test-server-chat.cjs`。

### Task 2：按操作者分组的审计 API（TDD）

**Files:**
- Create: `pages/api/ops/audit/actors.js`
- Create: `pages/api/ops/audit/actor/[actorId].js`
- Create: `test-audit-actors-api.cjs`
- Modify: `lib/auth-store.cjs`, `package.json`

- [ ] 写 RED 测试：最高管理员获得所有操作者分组；运营只获得自己和所辖主播；主播/未登录拒绝；操作者时间线含聊天正文、快照同步和登录动作，其他组织不可见。
- [ ] 实现聚合查询和分页时间线，所有范围从会话推导；`actorId` 不接受越权；保留旧 `/api/ops/audit` 兼容。
- [ ] 运行 `node test-audit-actors-api.cjs` 和既有审计测试。

### Task 3：审批中心收敛与用户管理 API（TDD）

**Files:**
- Create: `pages/api/admin/users.js`
- Create: `pages/api/admin/users/[userId]/status.js`
- Create: `pages/api/admin/users/[userId]/delete-confirm.js`
- Create: `pages/api/admin/users/[userId].js`
- Create: `test-user-management-api.cjs`
- Modify: `pages/api/auth/approvals.js`, `lib/auth-session.cjs`, `package.json`

- [ ] 写 RED 测试：运营访问用户管理返回 403；超级管理员获取用户列表和 usageStatus；停用/恢复改变登录能力；删除确认令牌绑定用户和短时过期；删除端点拒绝无效令牌和受保护超级管理员。
- [ ] 实现 GET 列表、POST 状态、POST 确认令牌、DELETE 永久删除；所有写操作审计并返回通用错误。
- [ ] 运行 API 测试和 `npm test`。

### Task 4：三个后台页面 UI（TDD + UI Polish）

**Files:**
- Create: `pages/audit.js`, `components/admin/AuditWorkspace.js`
- Create: `pages/users.js`, `components/admin/UserManagementWorkspace.js`
- Modify: `pages/admin.js`, `components/admin/AdminWorkspace.js`, `components/admin/admin.module.css`
- Modify: `test-admin-ui.cjs`

- [ ] 先读取 `ui-core`、`ui-web`、`ui-feedback`、`ui-review`，再补 UI 契约 RED 断言：审批中心只有审批内容和导航；审计页有操作者分组/时间线；用户页有使用状态、停用、恢复、永久删除二次确认。
- [ ] 实现导航和页面加载、筛选、空态、错误态、处理中态；永久删除确认弹窗必须明确目标和范围，点击确认才发送 DELETE。
- [ ] 运行 UI 契约、构建和 `git diff --check`。

### Task 5：主播最新工作台快照存储与 API（TDD）

**Files:**
- Create: `test-workspace-snapshot-store.cjs`, `test-workspace-snapshot-api.cjs`
- Create: `pages/api/chat/workspace-snapshot.js`
- Create: `pages/api/ops/anchors/[anchorId]/workspace.js`
- Modify: `lib/auth-store.cjs`, `package.json`

- [ ] 写 RED 测试：主播可写自己的最新快照且第二次覆盖；旧 AI 候选不再返回；运营只能读所辖主播；超级管理员可读全部；主播不能读管理接口；敏感键/超限快照返回 400；查看写入审计但不修改聊天状态。
- [ ] 实现快照清洗、大小/条数限制、upsert、作用域读取和关联聊天历史。
- [ ] 运行快照存储/API 测试以及所有服务端回归。

### Task 6：主播端同步与管理端只读工作台（TDD + UI Polish）

**Files:**
- Modify: `components/chat/ChatWorkspace.js`, `components/chat/chat.module.css`
- Create: `components/chat/ReadonlyChatWorkspace.js`
- Modify: `components/admin/UserManagementWorkspace.js`, `test-chat-ui.cjs`, `test-admin-ui.cjs`

- [ ] 写 RED 契约：草稿停顿防抖、AI 生成后同步、只读工作台显示最新候选/画像/算法/聊天、写按钮不存在或 disabled、显示未发送标记。
- [ ] 实现服务端同步防抖、请求序列号和异常提示；管理端通过授权 anchorId 加载只读组件，不读取主播浏览器本地记忆。
- [ ] 运行 UI/存储回归和生产构建。

### Task 7：真实 3102 验收与交付

**Files:**
- Modify: `task_plan.md`, `progress.md`

- [ ] 运行 `npm test && npm run build && git diff --check`。
- [ ] 用测试账号验证审批中心、分组审计、用户停用/恢复、二次确认删除保护、主播快照同步和只读查看；不删除现有正式超级管理员或测试账号，除非用户另行要求。
- [ ] 检查 3102 页面 HTTP 200、API 401/403/200 证据；记录未验证边界。
- [ ] 更新计划和进度后提交实现。
