# 浏览器回归安全前置实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use test-driven-development for each task, and verification-before-completion before reporting completion.

**Goal:** 在真实浏览器回归开始前，用无副作用的 preflight 阻断 3102、正式数据库、真实凭据和匿名测试环境误用。

**Architecture:** 新增纯函数模块 `lib/browser-regression-preflight.cjs`，由 CLI `scripts/browser-regression-preflight.cjs` 调用；模块只解析传入环境，不启动服务、不连接数据库、不读取 Cookie。Node 契约测试覆盖默认拒绝、合法临时配置、路径与端口边界、敏感变量脱敏。

**Tech Stack:** Node 22 CommonJS、URL/path 内置模块、Node `assert`。

---

### Task 1: 写 preflight 失败测试

**Files:** `test-browser-regression-preflight.cjs`, `lib/browser-regression-preflight.cjs`

1. 先创建测试，要求缺变量、3102、正式数据库、provider key、Cookie 和非法 URL 都抛出稳定错误码。
2. 增加一组合法临时目录/端口配置，要求返回安全摘要且不包含原始环境值。
3. 运行测试确认实现不存在时按预期失败（RED）。

### Task 2: 实现纯函数和 CLI

**Files:** `lib/browser-regression-preflight.cjs`, `scripts/browser-regression-preflight.cjs`

1. 实现环境规范化、路径外置判断、回环 URL/端口校验、敏感变量存在性检查和安全摘要。
2. CLI 只输出稳定 JSON 或稳定错误码，退出码分别为 0/1；不打印原始变量。
3. 运行定向测试和 CLI 合成环境冒烟（GREEN）。

### Task 3: 更新浏览器方案与生产文档

**Files:** `docs/production/BROWSER-REGRESSION.md`, `docs/production/TEST-RESULTS.md`, `docs/production/MODULE-STATUS.md`, `progress.md`, `task_plan.md`

1. 将 preflight 作为真实浏览器驱动的第一步，明确仍需外部浏览器和允许临时监听的环境。
2. 运行全量 `npm test`、`git diff --check` 和隔离生产构建。
3. 只有通过命令输出后才记录阶段完成；不把 preflight 通过当成真实浏览器通过。

### 完成标准

- [x] Task 1 完成并有 RED/GREEN 证据。
- [x] Task 2 完成并有 CLI 冒烟证据。
- [x] Task 3 完成并有全量测试、差异检查和隔离构建证据。
