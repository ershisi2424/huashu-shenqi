# Production Baseline Implementation Plan

**Goal:** 按用户已确认的“测试→修复→继续开发”顺序，先建立不会漏跑的测试基线。

**Architecture:** 根目录现有 test-*.cjs 保留，通过 Node 跨平台 runner 自动发现、逐个独立子进程执行，失败即非零并保留结果摘要；不改业务数据库和生产 API。浏览器测试作为独立下一步，不能以源码字符串检查替代。

**Tech Stack:** Node 22 LTS（`better-sqlite3` 要求 Node >=22）、现有断言测试、Next.js 16.3.3、SQLite。

## 验收契约

- [x] 先增加 test-verification-runner.cjs，运行并观察缺少实现导致的失败。
- [x] scripts/verification/discovery.cjs 的 discoverTests(root) 返回排序后的根目录 test-*.cjs 普通文件；目录和符号链接不作为测试。
- [x] scripts/verification/runner.cjs 的 runSuite(root, options) 逐个调用当前 process.execPath，不用 shell；返回每文件耗时、退出码、signal、errorCode，任意失败/超时导致整套失败。
- [x] 每个测试进程使用独立临时 AUTH_DB_PATH 和经过过滤的运行环境；不得继承真实 API Key、会话 Cookie、数据库路径或 NODE_OPTIONS。
- [x] 无测试文件时报 EMPTY_TEST_SUITE；单文件超时结束子进程而不是永久挂起。
- [x] scripts/verify.cjs 支持 --list 和默认执行，未知参数失败。npm test 不再维护长命令串。
- [x] 测试自测覆盖：自动发现、已有两份被漏掉测试、空集、失败、超时、隔离路径、敏感环境过滤、成功全跑和失败停跑。
- [x] package.json engines 和 CI 统一 Node 22；package-lock 根包元数据同步。
- [ ] 全量 npm test、git diff --check、隔离副本生产构建通过后进入 Playwright 引入。

## 约束

- 不读取真实 .env 内容、生产数据库内容，不操作 3102 服务。
- 不提交或丢弃已有未提交工作；每次改动均保留现有功能。
- 测试通过不等于真实 GLM、手机或 Windows 验收通过；分开记录。
