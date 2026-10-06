# GLM-5.3 与 OCR 合成样本联调 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This checkout already contains unrelated unfinished changes; do not commit or merge without explicit user authorization.

**Goal:** 用一个本地命令和固定的合成截图验证真实 GLM-5.3 与 OCR HTTP 链路，输出脱敏、可执行的诊断结论。

**Architecture:** `lib/smoke/ai-ocr-smoke.cjs` 只负责请求、结构校验和错误分类，可注入 HTTP 函数以离线测试；`scripts/ai-ocr-smoke.cjs` 只负责 CLI 参数、固定合成样本和输出。`fixtures/ocr-synthetic-chat.png` 是非真实数据的确定性测试图，业务 API 和鉴权逻辑不变。

**Tech Stack:** Node.js CommonJS、内置 `fetch`/`node:test`、Next.js 现有 API、Sharp（仅生成固定 PNG）、Tesseract.js。

---

## 文件职责

- `lib/smoke/ai-ocr-smoke.cjs`：导出 `runSmoke({ baseUrl, request, imageBuffer, cookie })`、`classifyFailure`、`validateAiResult`、`validateOcrResult`；不直接读取真实聊天或数据库。
- `scripts/ai-ocr-smoke.cjs`：读取项目固定图片、解析 `--base-url`，调用 runner，只打印阶段状态、耗时和错误码；可选从 `SMOKE_SESSION_COOKIE` 环境变量取现有会话 Cookie，不在命令行或输出中回显。
- `fixtures/ocr-synthetic-chat.svg`、`fixtures/ocr-synthetic-chat.png`：虚构聊天图片的可读源和固定栅格结果。
- `test-ai-ocr-smoke.cjs`：离线测试请求路径、样本、成功 Schema、Key/鉴权/限流/OCR 失败分类、脱敏输出。
- `package.json`：增加 `smoke:ai-ocr` 和全量测试中的定向测试。
- `README.md`：记录本机运行、预期结果和真实 Key/OCR 语言包的验收边界。

## Task 1：固定合成样本与失败测试

- [ ] **Step 1：写 `test-ai-ocr-smoke.cjs` 中的图片测试。** 使用 `assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a")` 和 `assert.ok(buffer.length < 8 * 1024 * 1024)` 验证固定 PNG；当前文件不存在，应先观察 `ENOENT`。
- [ ] **Step 2：运行 `node test-ai-ocr-smoke.cjs`。** 预期因 `fixtures/ocr-synthetic-chat.png` 不存在而失败，而非测试语法错误。
- [ ] **Step 3：用 `apply_patch` 添加 `fixtures/ocr-synthetic-chat.svg`。** SVG 画布 1200×620，浅色背景、左侧虚构消息“今天刚下班，有点累。”、右侧虚构消息“忙了一天，先歇口气。”；不包含个人信息。
- [ ] **Step 4：生成固定 PNG。** 使用 `node -e 'require("sharp")("fixtures/ocr-synthetic-chat.svg").png().toFile("fixtures/ocr-synthetic-chat.png")'`；这是从已审查源资产机械生成二进制夹具，不编辑业务代码。
- [ ] **Step 5：再次运行定向测试。** 图片断言通过；后续未实现的 runner 断言继续失败。

## Task 2：离线 runner 的红绿循环

- [ ] **Step 1：扩展 `test-ai-ocr-smoke.cjs`。** 为 `runSmoke` 注入 `request(url, options)`，依次返回 `/api/health`、`/api/profile`、`/api/ocr` 的真实接口形状；断言路径顺序、`consent === true`、只出现合成文本、图片 Data URL、`provider/model/algorithmCore/coreDecision`、4–8 条不同风格回复和 OCR 人工确认门禁。
- [ ] **Step 2：运行定向测试，确认缺少 `runSmoke` 导致红灯。** 不接受因为假样本或语法出错而失败。
- [ ] **Step 3：实现 `lib/smoke/ai-ocr-smoke.cjs`。** `runSmoke` 固定执行 health → AI → OCR，`new URL` 校验目标必须为 loopback `http://127.0.0.1`、`http://localhost` 或 `http://[::1]`；每步只返回 `{ stage, ok, durationMs, code, hint }`，不返回原始素材、Key、Cookie 或上游响应。
- [ ] **Step 4：测试错误分类。** 健康检查未配置时返回 `ZAI_API_KEY_MISSING`；401 返回 `AUTH_REQUIRED`；429 区分 `ZHIPU_RATE_LIMIT`、`ZHIPU_ACCOUNT_ARREARS`；502 AI 根据已知响应文本映射 `ZHIPU_KEY_INVALID`、`ZHIPU_FORBIDDEN`、`AI_TIMEOUT`、`INVALID_AI_SCHEMA`；OCR 依赖/语言包失败给出检查步骤，400 给出图片验证提示。未知错误只给通用提示，不打印原始响应。
- [ ] **Step 5：再次运行 `node test-ai-ocr-smoke.cjs`。** 预期全部断言通过，并检查 `JSON.stringify(result)` 不含合成文本全文、Cookie 或测试 Key。

## Task 3：CLI 与命令入口

- [ ] **Step 1：添加 CLI 契约测试。** 用 `spawnSync(process.execPath, ["scripts/ai-ocr-smoke.cjs", "--base-url", "https://example.com"])` 断言拒绝非本机目标且标准输出/错误输出不含 `SMOKE_SESSION_COOKIE` 测试值；先观察脚本不存在的红灯。
- [ ] **Step 2：实现 CLI。** 默认 `http://127.0.0.1:3102`；只接受一个 `--base-url` 参数；读取固定 PNG；从 `SMOKE_SESSION_COOKIE` 环境变量取可选 Cookie，禁止打印；调用 runner 并用 `process.exitCode = result.ok ? 0 : 1` 返回状态。每阶段输出 `PASS/FAIL`、耗时、代码与提示，不打印原始 JSON。
- [ ] **Step 3：在 `package.json` 加入 `"smoke:ai-ocr": "node scripts/ai-ocr-smoke.cjs"`，并把 `node test-ai-ocr-smoke.cjs` 加入 `npm test`。**
- [ ] **Step 4：运行 `node test-ai-ocr-smoke.cjs` 和 `npm test`。** 全量测试必须退出 0。

## Task 4：文档与实机分层验证

- [ ] **Step 1：更新 `README.md`。** 写明 `npm run smoke:ai-ocr`、可选 `-- --base-url http://127.0.0.1:3102`、`SMOKE_SESSION_COOKIE` 仅用于 `AUTH_REQUIRED=true` 的本机服务、不在命令行传 Key，以及本脚本只用合成素材但会真实调用智谱。
- [ ] **Step 2：执行静态检查。** `git diff --check`、`node test-ai-ocr-smoke.cjs`、`npm test`。
- [ ] **Step 3：隔离构建。** 使用 `mktemp -d /private/tmp/huashu-smoke-build-XXXXXX` + `rsync` 排除 `.next` 与 `data/auth.sqlite*`，在临时目录运行 `npm run build`，确认退出 0。
- [ ] **Step 4：对现有本机服务运行一次 `npm run smoke:ai-ocr`。** 若无 Key 或无 CLI 会话，仅记录 `ZAI_API_KEY_MISSING` / `AUTH_REQUIRED` 的实测结果，不宣称真实 GLM 通过；若有合法配置，才可记录真实 AI/OCR 通过。
- [ ] **Step 5：更新 `task_plan.md`、`findings.md`、`progress.md`。** 清楚拆分“离线通过”“本机 HTTP 检查通过”“真实智谱通过”“真实 OCR 通过”和未完成项。

## 计划自检

- 规格覆盖：合成素材、真实业务接口、结构验收、脱敏输出、鉴权、错误分类、无 Key 与有 Key 分层均有对应步骤。
- 不修改业务 API、数据库或聊天 UI；不新增公开诊断路由。
- 本计划不包含 Git commit；当前工作树含其他未提交内容，提交需用户另行授权。
