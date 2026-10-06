# 回复历史 Runtime 上下文持久化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use test-driven-development for each task, and verification-before-completion before reporting completion.

**Goal:** 将每批 AI 候选回复与生成时的 Runtime 上下文一起持久化并在恢复时完整还原，消除刷新丢失和历史错配。

**Architecture:** 在现有 `reply_history` 表后追加一条可校验 SQLite migration；服务端 store/API 负责 JSON 限长与容错；登录用户由 ChatWorkspace 通过 API 保存，访客沿用按账号/维护对象隔离的 localStorage；恢复动作一次性更新候选与 Runtime 状态。

**Tech Stack:** Next.js pages API、React、SQLite/better-sqlite3、CommonJS 单元契约测试、Node 内置 `assert`。

---

### Task 1: 扩展回复历史数据库与 API 契约

**Files:** `lib/db-migrations.cjs`, `lib/auth-store.cjs`, `pages/api/chat/reply-history.js`, `test-db-migrations-backup.cjs`, `test-chat-reply-history-runtime-context.cjs`

1. 先写测试：初始化新库后检查 0003 migration 和五列；通过 store/API 保存并读取完整 Runtime 五组字段。
2. 运行定向测试，确认在实现前因缺列/未透传而失败（RED）。
3. 增加 `0003.reply-history-runtime-context`，在 auth store 初始化时应用；扩展 `mapReplyHistory` 与 `saveReplyHistory`，所有 JSON 按现有 `sanitizeAuditValue` 和限长策略写入。
4. 扩展 API POST 将字段白名单透传，GET 返回兼容的 camelCase 字段；旧行解析失败降级为空值。
5. 重新运行 migration、store、API、边界测试（GREEN）。

### Task 2: 让登录/访客客户端保存并恢复完整上下文

**Files:** `components/chat/ChatWorkspace.js`, `lib/chat-local-store.cjs`, `test-chat-reply-history-runtime-ui.cjs`

1. 先写源代码契约，要求服务端保存参数、访客 local history 和恢复函数都包含五组 Runtime 字段。
2. 运行契约测试确认当前实现缺少服务端保存和恢复字段（RED）。
3. 将 `saveReplyHistory` 的参数和请求体补齐；将访客 `localItem` 补齐；恢复时调用 Runtime、话题、邀请 setters，并清理当前错误状态。
4. 对 local history 增加轻量归一化，限制数组/文本长度并兼容旧记录。
5. 运行 UI/source、候选持久化和 local-store 测试（GREEN）。

### Task 3: 全量验证、构建与文档

**Files:** `docs/production/MODULE-STATUS.md`, `docs/production/TEST-RESULTS.md`, `progress.md`, `task_plan.md`

1. 更新模块状态、测试结果与阶段记录，明确数据库 migration、API 往返和恢复语义。
2. 运行 `npm test`、`git diff --check`。
3. 在隔离临时目录执行生产构建，避免改写当前工作树 `.next`。
4. 仅在命令输出可核对时报告通过；明确真实 GLM、浏览器和 Windows 局域网验收仍需环境验证。

### 完成标准

- [x] Task 1 完成并有 RED/GREEN 证据。
- [x] Task 2 完成并有 RED/GREEN 证据。
- [x] Task 3 完成并有全量测试、diff 检查和隔离构建证据。
