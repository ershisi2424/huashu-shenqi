# Runtime 结果投影 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让旧首页只展示服务端 Runtime 结果，不把浏览器本地预判显示为正式分析。

**Architecture:** 新增无副作用的 `projectRuntimeAnalysis` 适配层，将 `/api/profile` 的服务端分析投影到旧首页兼容的展示字段。页面保留本地 `analyzeBrotherQuote` 作为内部 UI 辅助，但正式分析状态只由投影结果写入。

**Tech Stack:** Next.js Pages Router, React, CommonJS UI adapter, Node.js contract tests.

---

### Task 1: 固化 Runtime 投影契约

**Files:**
- Create: `lib/runtime-ui-projection.cjs`
- Create: `test-runtime-ui-projection.cjs`
- Create: `test-runtime-ui-projection-contract.cjs`

- [x] **Step 1: Write the failing unit test**

```js
const assert = require("node:assert/strict");
const { projectRuntimeAnalysis } = require("./lib/runtime-ui-projection.cjs");

const result = projectRuntimeAnalysis({
  analysis: {
    primaryGoal: "承接",
    familiarity: "熟悉",
    emotion: { label: "负面情绪", intensity: 4, evidence: ["累"] },
    risk: { level: "none", types: [] },
    facts: ["对方说今天很累"],
    unknowns: ["是否愿意继续聊"],
    decision: { action: "先回应具体感受", observationWindow: "观察是否继续表达", stopCondition: "对方明确不想聊" },
    algorithmCore: { name: "goutoujunshi", revision: "test-revision" },
  },
  profile: { summary: "基于服务端证据" },
});

assert.equal(result.runtimeOnly, true);
assert.equal(result.primaryGoal, "承接");
assert.equal(result._runtimeAnalysis.facts[0], "对方说今天很累");
assert.equal(result._relationshipState.algorithmCore.name, "goutoujunshi");
assert.equal(result.scenarioLabel, "Runtime · 承接");
assert.equal(result.crossLine, false);

const highRisk = projectRuntimeAnalysis({
  analysis: { primaryGoal: "收线", emotion: { label: "未明确", intensity: 0 }, risk: { level: "high", types: ["threat"] }, decision: { action: "先保护边界" } },
});
assert.equal(highRisk.crossLine, true);
assert.equal(highRisk.replyDifficulty, "高危");

console.log("test-runtime-ui-projection: ok");
```

- [x] **Step 2: Run test to verify it fails**

Run: `node test-runtime-ui-projection.cjs`

Expected: FAIL with `Cannot find module './lib/runtime-ui-projection.cjs'`.

- [x] **Step 3: Write the minimal projection implementation**

Create `lib/runtime-ui-projection.cjs` with the following bounded adapter shape; the implementation may use equivalent names but must preserve these fields and precedence:

```js
function projectRuntimeAnalysis(payload = {}) {
  if (!payload || typeof payload !== "object") return null;
  const analysis = payload.analysis && typeof payload.analysis === "object"
    ? payload.analysis
    : payload.relationshipState && typeof payload.relationshipState === "object"
      ? payload.relationshipState
      : null;
  if (!analysis) return null;
  const risk = analysis.risk && typeof analysis.risk === "object" ? analysis.risk : {};
  const emotion = analysis.emotion && typeof analysis.emotion === "object" ? analysis.emotion : {};
  const decision = analysis.decision && typeof analysis.decision === "object" ? analysis.decision : {};
  const primaryGoal = boundedText(analysis.primaryGoal, 40) || "承接";
  const emotionIntensity = clamp(Number(emotion.intensity) * 10, 0, 100);
  const riskHigh = risk.level === "high";
  const relationshipState = payload.relationshipState && typeof payload.relationshipState === "object"
    ? payload.relationshipState
    : analysis;
  return {
    runtimeOnly: true,
    scenarioKey: "runtime",
    scenarioLabel: `Runtime · ${primaryGoal}`,
    brotherType: boundedText(analysis.familiarity, 40) || "未知",
    emotionIntensity,
    riskScore: riskHigh ? 100 : 0,
    crossLine: riskHigh,
    crossLineType: boundedList(risk.types, 6).join("、"),
    intent: boundedText(decision.action, 300) || primaryGoal,
    primaryGoal,
    facts: boundedList(analysis.facts),
    unknowns: boundedList(analysis.unknowns),
    _relationshipState: relationshipState,
    _runtimeAnalysis: analysis,
    _aiProfile: payload.profile && typeof payload.profile === "object" ? payload.profile : null,
  };
}
module.exports = { projectRuntimeAnalysis };
```

- [x] **Step 4: Run the unit test**

Run: `node test-runtime-ui-projection.cjs`

Expected: PASS and `test-runtime-ui-projection: ok`.

- [x] **Step 5: Add the page integration contract test**

The contract test must assert `pages/index.js` imports `projectRuntimeAnalysis`, contains a success-path call with `payload`, does not contain `setAnalysis(localAnalysis)`, and clears the formal analysis state with `setAnalysis(null)` before/after a failed request.

### Task 2: Switch the old homepage to server projection

**Files:**
- Modify: `pages/index.js`
- Test: `test-runtime-ui-projection-contract.cjs`

- [x] **Step 1: Run the contract test to verify RED**

Run: `node test-runtime-ui-projection-contract.cjs`

Expected: FAIL because the page does not import the adapter and still calls `setAnalysis(localAnalysis)` before the API response.

- [x] **Step 2: Remove the pre-request formal analysis write**

Keep the local helper only for internal reply metadata and UI hints. Replace the pre-request `setAnalysis(localAnalysis)` with clearing the previous formal analysis before the request.

- [x] **Step 3: Project the server response**

After the `/api/profile/` response succeeds, use the following flow so no local prediction becomes formal state:

```js
setAnalysis(null);
const projectedAnalysis = projectRuntimeAnalysis(payload);
if (!projectedAnalysis) throw new Error("AI 分析结果缺少 Runtime 状态");
projectedAnalysis._contextualTags = { hasHistory: broContext.length > 0, contextCount: broContext.length };
setAnalysis(projectedAnalysis);
```

The catch path must call `setAnalysis(null)` before retaining the existing user-facing error message.

- [x] **Step 4: Run focused tests**

Run: `node test-runtime-ui-projection.cjs && node test-runtime-ui-projection-contract.cjs && node test-generation-contract.cjs && node test-api.cjs`

Expected: all four pass.

### Task 3: Full regression and documentation

**Files:**
- Modify: `docs/production/MODULE-STATUS.md`
- Modify: `docs/production/TEST-RESULTS.md`
- Modify: `progress.md`
- Modify: `task_plan.md`

- [x] **Step 1: Run the full suite**

Run: `npm test`

Expected: all discovered tests pass, with the new projection tests included.

- [x] **Step 2: Run static and build verification**

Run: `git diff --check`; then build a fresh temporary copy with a real copied `node_modules` and read-only `data/scripts.json` using `npm run build`.

Expected: no whitespace errors and production build exit code 0.

- [x] **Step 3: Record the boundary**

Document that old homepage formal analysis is now server-projected, while real provider/browser/Windows acceptance remains pending.
