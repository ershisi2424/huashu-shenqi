# Agent Browser 回归冒烟实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use test-driven-development for each task, and verification-before-completion before reporting completion.

**Goal:** 将 preflight 后的真实浏览器启动、登录页可达性和 origin 保持检查固化为可选命令。

**Architecture:** `scripts/browser-regression/agent-browser-smoke.cjs` 只通过 `child_process.spawnSync` 调用外部 `agent-browser` CLI；它不实现登录和不读取凭据。所有安全判断由 `lib/browser-regression-preflight.cjs` 统一提供。

**Tech Stack:** Node 22 CommonJS、`agent-browser` 可选 CLI、现有 preflight 模块。

---

### Task 1: 先写 runner 契约测试

**Files:** `test-agent-browser-smoke-contract.cjs`, `scripts/browser-regression/agent-browser-smoke.cjs`

1. 固定 runner 必须调用 preflight、要求显式执行开关、禁止传入 Cookie/Key、使用随机 session、关闭 session 和检查 origin。
2. 运行测试确认 runner 不存在时按预期失败（RED）。

### Task 2: 实现可选浏览器冒烟器

**Files:** `scripts/browser-regression/agent-browser-smoke.cjs`, `package.json`

1. 实现稳定错误码、CLI 存在性检查、open/wait/get url/close 顺序和安全日志。
2. 增加 `npm run browser:smoke`，但不进入默认 `npm test`，避免没有浏览器时阻塞单元回归。
3. 通过合成环境运行 disabled 分支；在当前环境若找不到 agent-browser，不伪造真实浏览器通过。

### Task 3: 文档、全量回归和隔离构建

**Files:** `docs/production/BROWSER-REGRESSION.md`, `docs/production/TEST-RESULTS.md`, `docs/production/MODULE-STATUS.md`, `progress.md`, `task_plan.md`

1. 补充真实浏览器冒烟命令、显式开关和未安装/未监听时的边界。
2. 运行 `npm test`、`git diff --check` 和隔离生产构建。
3. 将真实浏览器和 Windows 10 局域网结果继续标记 PENDING，除非命令有实际输出证据。

### 完成标准

- [x] Task 1 完成并有 RED/GREEN 证据。
- [x] Task 2 完成并有 disabled/可选执行证据。
- [x] Task 3 完成并有全量测试、差异检查和隔离构建证据。
