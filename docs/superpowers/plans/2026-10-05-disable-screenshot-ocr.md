# 暂停截图 OCR 功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 关闭聊天页面的截图 OCR 入口和前端请求，同时保留后端 OCR 实现以便后续恢复。

**Architecture:** 新增 `lib/ocr/feature.cjs` 作为唯一关闭开关；`ChatWorkspace` 从该模块读取开关，渲染和事件处理都受同一开关保护。OCR API、适配器和联调脚本保持原样。

**Tech Stack:** Next.js/React、Node.js CommonJS、现有无框架断言测试。

---

### Task 1: Add the disabled feature contract

**Files:**
- Create: `lib/ocr/feature.cjs`
- Create: `test-ocr-feature.cjs`
- Modify: `package.json`

- [x] **Step 1: Write the failing test**

`test-ocr-feature.cjs` must require `lib/ocr/feature.cjs`, assert that `SCREENSHOT_OCR_ENABLED` is `false`, and assert that the chat component imports and uses the shared flag.

- [x] **Step 2: Run the test to verify it fails**

Run `node test-ocr-feature.cjs`; it should fail because the feature module does not exist yet.

- [x] **Step 3: Implement the minimal feature module**

Export `SCREENSHOT_OCR_ENABLED = false` from `lib/ocr/feature.cjs`, with a comment that the value is intentionally fixed until the OCR re-enable task is approved.

- [x] **Step 4: Run the test to verify it passes**

Run `node test-ocr-feature.cjs`; it should pass after the component import is updated in Task 2.

### Task 2: Route the chat UI through the shared switch

**Files:**
- Modify: `components/chat/ChatWorkspace.js`
- Modify: `test-chat-ui.cjs`

- [x] **Step 1: Add the failing contract assertion**

Assert that the component imports `SCREENSHOT_OCR_ENABLED` from `../../lib/ocr/feature.cjs`, aliases it to the existing `ENABLE_SCREENSHOT_OCR` name, and keeps the early return before any file read or fetch.

- [x] **Step 2: Run the focused tests**

Run `node test-ocr-feature.cjs`; it should fail until the component uses the shared flag.

- [x] **Step 3: Make the minimal UI change**

Replace the local hard-coded constant with the shared import. Keep the existing conditional around the upload input/preview and the early return in `handleOcrFile`. Do not remove OCR API code.

- [x] **Step 4: Verify focused tests**

Run `node test-ocr-feature.cjs && node test-chat-ui.cjs && node test-ocr-api.cjs` and expect all three to pass.

### Task 3: Run regression checks

**Files:**
- No additional production files.

- [x] **Step 1: Run OCR and chat regression tests**

Run `npm test` and `git diff --check`.

- [x] **Step 2: Confirm the preserved backend contract**

Run `node test-ai-ocr-smoke.cjs` and confirm the OCR smoke runner still passes its offline contract test; this demonstrates that only the UI path is paused.
