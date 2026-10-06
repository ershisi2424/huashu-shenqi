# Runtime 唯一入口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让旧首页和 `/chat` 都只依赖服务端 `goutoujunshi Runtime → GLM-5.3` 正式分析结果，消除浏览器侧第二套关系判断路径。

**Architecture:** `/api/profile` 保持唯一生成入口；旧首页只负责收集输入和渲染服务端返回的 `relationshipState`。服务端继续从会话、维护对象和 `sourceMessageId` 重建正式账号上下文，不信任浏览器提交的关系分析。旧 `lib/goutoujunshi-core.js` 暂保留为兼容离线模块，不参与正式页面生成。

**Tech Stack:** Next.js Pages Router, React, Node.js ESM/CJS modules, SQLite-backed auth/chat store, existing `goutoujunshi-runtime` contract, Node contract tests.

---

### Task 1: 固化旧入口的唯一 Runtime 契约

**Files:**
- Create: `test-runtime-single-entry.cjs`
- Modify: `task_plan.md`
- Modify: `progress.md`

- [x] **Step 1: Write the failing test**

```js
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "pages/index.js"), "utf8");

if (/analyzeGoutoujunshi\s*\(/.test(source)) {
  throw new Error("legacy browser-side goutoujunshi analysis is still active");
}
if (/relationshipState\s*[,}]|relationshipState\s*:/.test(source)) {
  throw new Error("legacy relationshipState is still submitted as generation input");
}
if (!source.includes("/api/profile/")) {
  throw new Error("legacy entry no longer points at the server profile API");
}
console.log("test-runtime-single-entry: contract failed as expected");
```

- [x] **Step 2: Run test to verify it fails**

Run: `node test-runtime-single-entry.cjs`

Expected: FAIL because `pages/index.js` currently imports and calls `analyzeGoutoujunshi` and submits `relationshipState`.

- [x] **Step 3: Update the test to assert the precise compatibility boundary**

Keep the test checking that the old browser path contains no call to `analyzeGoutoujunshi`, no `relationshipState` request field, and still contains `/api/profile/`. Do not assert unrelated markup or implementation details.

- [x] **Step 4: Add the test to the default runner**

Add `test-runtime-single-entry.cjs` to the test discovery set used by `scripts/verify.cjs`; the test must run with the existing isolated process and no real database.

- [x] **Step 5: Run the failing test through the runner**

Run: `node test-runtime-single-entry.cjs`

Expected: FAIL with the legacy-path message, confirming the test catches the existing behavior.

### Task 2: Remove the browser-side formal analysis input

**Files:**
- Modify: `pages/index.js`
- Test: `test-runtime-single-entry.cjs`

- [ ] **Step 1: Remove the old import and local decision call**

Delete the `analyzeGoutoujunshi` import and the block that builds `localAnalysis._relationshipState` before the `/api/profile` request. Keep the source materials, current message, history and reply preference fields that the server already accepts.

- [ ] **Step 2: Remove `relationshipState` from the request body**

Do not send the browser-computed object to `/api/profile`. Preserve `currentMessage`, `history`, `sources`, `profile`, `replyStyle`, and the existing server-verifiable source identifiers.

- [ ] **Step 3: Render server response state**

After the response is parsed, assign the returned `relationshipState` to the page's analysis state used by the existing cards. If the API fails, clear the current server-derived state and display the existing retry/error state instead of retaining an old local prediction.

- [ ] **Step 4: Run the focused test**

Run: `node test-runtime-single-entry.cjs`

Expected: PASS and output `test-runtime-single-entry: ok`.

### Task 3: Protect the server contract from legacy state

**Files:**
- Modify: `pages/api/profile.js`
- Test: `test-runtime-single-entry.cjs`

- [ ] **Step 1: Add a request-contract assertion**

Assert from the route source or existing API contract test that `relationshipState` is not read as an authoritative analysis input. The server may continue returning `relationshipState` for display.

- [ ] **Step 2: Reject or ignore legacy client state explicitly**

Choose the existing compatibility behavior: ignore `body.relationshipState` for formal accounts, and keep the server-created `runtimeResult.analysis` as the only relationship state. Do not change response shape or error codes.

- [ ] **Step 3: Run focused API tests**

Run: `node test-api.cjs && node test-server-chat-api.cjs && node test-runtime-single-entry.cjs`

Expected: all pass, including source-message scope and role authorization checks.

### Task 4: Regression and production verification

**Files:**
- Modify: `docs/production/MODULE-STATUS.md`
- Modify: `docs/production/TEST-RESULTS.md`
- Modify: `progress.md`
- Modify: `task_plan.md`

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: all discovered tests pass; the runner reports the final count and no real credentials are used.

- [ ] **Step 2: Run static checks**

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 3: Build an isolated production copy**

Copy the worktree to a fresh temporary directory, copy dependencies instead of symlinking them, and run `npm run build`. Do not stop or restart the existing 3102 service or touch its database.

Expected: production build completes in the isolated copy.

- [ ] **Step 4: Record evidence and limitations**

Document that old and new pages now share the server Runtime contract, while real browser/GLM/Windows runtime acceptance remains separate and not implied by the test result.
