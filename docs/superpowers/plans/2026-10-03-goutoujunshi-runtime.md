# Goutoujunshi 本地运行时复刻 Implementation Plan

> Implementation status (2026-10-03): Tasks 1-8 completed in the isolated worktree. Runtime input/decision/knowledge/memory layers, profile API integration, chat evidence UI, regression suite, upstream validator, and copied-directory production build are verified. The original worktree `.next` was not overwritten because the live service holds it open.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Next.js 主播维护系统中实现一个可独立测试的 `goutoujunshi` 本地 Runtime，覆盖上游 Skill 的情绪、建档、证据、知识路由、关系判断、行动收束和同意式长期记忆，并让 GLM-5.3 只负责受约束的自然语言表达。

**Architecture:** 新建 `lib/goutoujunshi-runtime/` 作为纯函数 Runtime，输入主播账号、维护对象、授权素材和记忆命令，输出固定版本的五阶段分析状态。服务端 API 使用认证后的 SQLite 适配器提供主播/对象隔离记忆；`pages/api/profile.js` 消费 Runtime 输出后才调用 GLM-5.3。聊天页展示可折叠分析依据，但不增加抖音抓取、自动发送、礼物诱导或敏感属性推断。

**Tech Stack:** Next.js 16.3.3 API routes, React 19, ESM `.js` runtime modules, CommonJS `auth-store.cjs` with better-sqlite3, Node CJS contract tests, vendored Markdown references, Python upstream validator.

---

## 文件地图

### Create

- `lib/goutoujunshi-runtime/constants.js`：Runtime 名称、版本、阶段、目标枚举、输入上限和上游 revision。
- `lib/goutoujunshi-runtime/input.js`：输入清洗、来源和说话人映射规范化。
- `lib/goutoujunshi-runtime/intake.js`：首次建档/补问和确认档案摘要。
- `lib/goutoujunshi-runtime/evidence.js`：事实、推测、未知、矛盾和证据来源拆分。
- `lib/goutoujunshi-runtime/knowledge.js`：上游路由表、allowlist、文件读取、SHA-256 和原文摘录。
- `lib/goutoujunshi-runtime/decision.js`：情绪落地、互惠/现实/风险/机会成本和唯一主目标。
- `lib/goutoujunshi-runtime/memory.js`：记忆命名空间、来源门禁和 auth-store 适配器接口。
- `lib/goutoujunshi-runtime/contract.js`：Runtime 输出归一化、prompt context 和 GLM 输出安全验证。
- `lib/goutoujunshi-runtime/index.js`：按五阶段编排上述模块的 `analyzeGoutoujunshiRuntime`。
- `pages/api/chat/runtime-memory.js`：主播范围内的状态、启用、暂停、恢复、查看、撤销、忘记对象和清空 API。
- `test-goutoujunshi-runtime.cjs`：纯 Runtime 五阶段、证据、路由、安全和输出契约测试。
- `test-goutoujunshi-runtime-memory.cjs`：Runtime 记忆适配器和命名空间测试。
- `test-runtime-memory-api.cjs`：记忆 API 鉴权、角色范围和命令测试。

### Modify

- `lib/auth-store.cjs`：增加 Runtime memory 表、迁移、读写/撤销/清空方法和主播权限校验。
- `pages/api/profile.js`：调用 Runtime，使用其 `promptContext`、`analysis` 和 `loadedReferences`，保留现有回复响应字段。
- `components/chat/ChatWorkspace.js`：保存 Runtime 状态并渲染“分析依据”折叠面板与记忆状态入口。
- `components/chat/chat.module.css`：为分析依据、事实/推测/未知、风险和引用资料增加移动端样式。
- `test-api.cjs`：断言 profile API 只能使用服务端 Runtime 状态，并返回 runtime/analysis。
- `test-generation-contract.cjs`：断言页面提交 Runtime 兼容字段并渲染分析依据。
- `package.json`：在 `npm test` 中加入三组新测试，在 `scripts` 增加 `test:runtime`。
- `task_plan.md`、`findings.md`、`progress.md`：每个阶段记录状态、证据和错误。

## Task 1: Runtime 输入规范化和证据边界

**Files:**
- Create: `test-goutoujunshi-runtime.cjs`
- Create: `lib/goutoujunshi-runtime/constants.js`
- Create: `lib/goutoujunshi-runtime/input.js`
- Create: `lib/goutoujunshi-runtime/evidence.js`

- [ ] **Step 1: Write the failing test**

Append to `test-goutoujunshi-runtime.cjs`:

```js
const assert = require("node:assert/strict");
const { normalizeRuntimeInput } = await import("./lib/goutoujunshi-runtime/input.js");
const { splitEvidence } = await import("./lib/goutoujunshi-runtime/evidence.js");

const input = normalizeRuntimeInput({
  actor: { userId: "anchor-1", role: "anchor" },
  subject: { brotherId: "brother-1", alias: "同名大哥" },
  currentMessage: "最近工作很累",
  history: [{ sender: "brother", message: "昨天加班", source: "paste" }],
  sources: { works: "他发布过户外视频", comments: "评论说周末钓鱼", statements: "" },
  speakerMapping: { brother: "brother", anchor: "anchor" },
});
assert.equal(input.actor.userId, "anchor-1");
assert.equal(input.subject.brotherId, "brother-1");
assert.equal(input.history.length, 1);
assert.ok(input.limits.currentMessage <= 800);

const evidence = splitEvidence(input);
assert.ok(evidence.facts.some((item) => item.text.includes("最近工作很累")));
assert.ok(evidence.unknowns.some((item) => item.text.includes("熟悉程度")));
assert.equal(evidence.evidence[0].speaker, "brother");
assert.equal(evidence.evidence[0].source, "current_message");
console.log("runtime input/evidence red contract reached");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node test-goutoujunshi-runtime.cjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/goutoujunshi-runtime/input.js`.

- [ ] **Step 3: Implement the minimal input and evidence modules**

`constants.js` must export `RUNTIME_META`, `STAGES`, `PRIMARY_GOALS`, `SOURCE_TYPES`, `MAX_LIMITS`. `input.js` must strip NUL/control characters, cap the current message at 800 characters, each source at 6000, history at 10 rows, and reject an empty `actor.userId` or `subject.brotherId` with `RUNTIME_SCOPE_REQUIRED`. `evidence.js` must create objects `{ text, source, speaker, confidence }`, keep raw current-message evidence as high confidence, put provided works/comments/statements into facts without turning them into personality conclusions, and add unknowns for missing profile, missing history, and unknown speaker mapping.

Use this stable exported shape:

```js
export function normalizeRuntimeInput(raw = {}) { /* return sanitized input */ }
export function splitEvidence(input) { /* return facts,inferences,unknowns,contradictions,evidence */ }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node test-goutoujunshi-runtime.cjs`

Expected: `runtime input/evidence red contract reached`.

- [ ] **Step 5: Commit the isolated task**

```bash
git add lib/goutoujunshi-runtime/constants.js lib/goutoujunshi-runtime/input.js lib/goutoujunshi-runtime/evidence.js test-goutoujunshi-runtime.cjs
git commit -m "feat: add goutoujunshi runtime input boundaries"
```

## Task 2: Upstream reference manifest and progressive disclosure

**Files:**
- Modify: `test-goutoujunshi-runtime.cjs`
- Create: `lib/goutoujunshi-runtime/knowledge.js`

- [ ] **Step 1: Write the failing test**

Add tests that call `loadRuntimeReferences` with a distress message and assert exactly three references, each under `references/`, each with a 64-character SHA-256, and that an invalid path throws `RUNTIME_REFERENCE_NOT_ALLOWED`. Also assert a normal greeting routes only the evidence and reply workflow references and never loads all files.

```js
const { loadRuntimeReferences } = await import("./lib/goutoujunshi-runtime/knowledge.js");
const routed = loadRuntimeReferences({ message: "今天被老板骂了，真的很难受", risk: { types: [] }, primaryGoal: "承接" });
assert.equal(routed.items.length, 3);
assert.ok(routed.items.every((item) => /^references\//.test(item.path)));
assert.ok(routed.items.every((item) => /^[a-f0-9]{64}$/.test(item.sha256)));
assert.ok(routed.items.some((item) => item.path.includes("03-依恋理论")));
assert.throws(() => loadRuntimeReferences({ selectedReferences: ["../SKILL.md"] }), /RUNTIME_REFERENCE_NOT_ALLOWED/);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node test-goutoujunshi-runtime.cjs`

Expected: FAIL because `loadRuntimeReferences` is not exported.

- [ ] **Step 3: Implement the reference loader**

Define a complete allowlist from the upstream `SKILL.md` route table, including evidence, reply workflow, emotion, online chat, conflict, consent, money, crisis, MBTI, invitation, imbalance, and classic social-system safety documents. Always include evidence and reply workflow, append one scenario reference, deduplicate, and cap at three. Resolve paths only under `process.cwd()/vendor/goutoujunshi`; read UTF-8, strip the fixed phrase-library section from the practical reply file, cap each excerpt at 2800 characters, and return `{ path, reason, sha256, excerpt }` plus `topics`.

```js
export function loadRuntimeReferences({ message = "", risk = {}, primaryGoal = "承接", selectedReferences = [] } = {}) {
  // allowlist -> route -> read -> hash -> return <= 3 items
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node test-goutoujunshi-runtime.cjs`

Expected: reference routing assertions pass.

- [ ] **Step 5: Commit**

```bash
git add lib/goutoujunshi-runtime/knowledge.js test-goutoujunshi-runtime.cjs
git commit -m "feat: add progressive goutoujunshi reference loader"
```

## Task 3: Intake, five-stage decision engine, and action contract

**Files:**
- Modify: `test-goutoujunshi-runtime.cjs`
- Create: `lib/goutoujunshi-runtime/intake.js`
- Create: `lib/goutoujunshi-runtime/decision.js`
- Create: `lib/goutoujunshi-runtime/contract.js`

- [ ] **Step 1: Write the failing tests**

Add tests for first-use intake, distress, money boundary, refusal, and ordinary greeting:

```js
const { buildIntake } = await import("./lib/goutoujunshi-runtime/intake.js");
const { decide } = await import("./lib/goutoujunshi-runtime/decision.js");
const first = buildIntake({ profile: {}, currentMessage: "在吗", urgent: false });
assert.equal(first.needsProfile, true);
assert.ok(first.questions.length >= 1 && first.questions.length <= 3);

const distress = decide({ message: "最近压力很大，真的不想干了", history: [], evidence: { facts: [], inferences: [], unknowns: [] } });
assert.equal(distress.primaryGoal, "承接");
assert.equal(distress.emotion.label, "负面情绪");
assert.ok(distress.decision.stopCondition);

const money = decide({ message: "给你刷个嘉年华", history: [], evidence: { facts: [], inferences: [], unknowns: [] } });
assert.equal(money.risk.types.includes("money"), true);
assert.ok(/边界|不推进|自愿/.test(money.decision.action + money.decision.stopCondition));

const refusal = decide({ message: "别再联系我了", history: [], evidence: { facts: [], inferences: [], unknowns: [] } });
assert.equal(refusal.primaryGoal, "收线");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node test-goutoujunshi-runtime.cjs`

Expected: FAIL because `buildIntake` and `decide` are missing.

- [ ] **Step 3: Implement intake and decision modules**

`intake.js` must use only explicitly supplied profile values, return at most three questions, and bypass questions when the message is high-risk or marked urgent. `decision.js` must implement the upstream order: emotion → evidence handoff → reciprocity/reality/risk/opportunity-cost → exactly one primary goal → action/observation/stop. It may reuse pure detectors from `lib/goutoujunshi-core.js`, but must return the expanded fields `emotionLanding`, `opportunityCost`, `risk`, `primaryGoal`, `decision`, `observationWindow`, and `stopCondition`. Explicit refusal, threat, money, sexual/privacy and self-harm must enter boundary-safe branches. It must not infer personality or sensitive traits from name, MBTI, gender or a single message.

`contract.js` must export:

```js
export function normalizeRuntimeResult(value) { /* fixed runtime/analysis/memory shape */ }
export function buildPromptContext(result, references) { /* JSON-safe model context */ }
export function validateGenerationAgainstRuntime(result, generated) { /* reject policy drift */ }
```

`validateGenerationAgainstRuntime` must reject generated output that contains gift inducement, transfer/loan pressure, fake permanent intimacy, sensitive-trait conclusions, or a `primaryGoal`/risk override. It must preserve the existing 4–8 reply requirement.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node test-goutoujunshi-runtime.cjs`

Expected: intake, emotion, target, refusal, boundary and output-contract assertions pass.

- [ ] **Step 5: Commit**

```bash
git add lib/goutoujunshi-runtime/intake.js lib/goutoujunshi-runtime/decision.js lib/goutoujunshi-runtime/contract.js test-goutoujunshi-runtime.cjs
git commit -m "feat: implement goutoujunshi five-stage decision runtime"
```

## Task 4: Server-side isolated memory store

**Files:**
- Modify: `lib/auth-store.cjs`
- Modify: `test-auth-store.cjs`
- Create: `lib/goutoujunshi-runtime/memory.js`
- Create: `test-goutoujunshi-runtime-memory.cjs`

- [ ] **Step 1: Write failing storage tests**

Extend `test-auth-store.cjs` with two anchors owning same-name brothers and assert their namespaces differ. Add cases for consent required, apply, list, pause/resume, undo, forget-object, revoke and clear. Assert raw chat text is not accepted as a stable profile field and `assistant_inference` is accepted only in `hypothesis` scope.

```js
const first = store.ensureRuntimeMemoryNamespace({ actor: anchor.id, brotherId: "b1" });
const second = store.ensureRuntimeMemoryNamespace({ actor: otherAnchor.id, brotherId: "b1" });
assert.notEqual(first.namespace, second.namespace);
assert.throws(() => store.applyRuntimeMemoryDelta({ actor: anchor.id, brotherId: "b1", delta: { scope: "object", field: "name", value: "同名", sourceType: "assistant_inference" } }), /CONSENT_REQUIRED|SOURCE_NOT_ELIGIBLE/);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node test-auth-store.cjs && node test-goutoujunshi-runtime-memory.cjs`

Expected: FAIL because Runtime memory tables and methods do not exist.

- [ ] **Step 3: Add SQLite schema and store methods**

In `createAuthStore`, add idempotent tables:

```sql
CREATE TABLE IF NOT EXISTS goutoujunshi_memory_settings (
  owner_user_id TEXT NOT NULL,
  brother_id TEXT NOT NULL,
  consent_enabled INTEGER NOT NULL DEFAULT 0,
  paused INTEGER NOT NULL DEFAULT 0,
  consent_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_user_id, brother_id)
);
CREATE TABLE IF NOT EXISTS goutoujunshi_memories (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  brother_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  field TEXT NOT NULL,
  value TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL DEFAULT '',
  confidence TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS goutoujunshi_memory_operations (
  op_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  brother_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

Add methods to the returned store object: `getRuntimeMemoryStatus`, `enableRuntimeMemory`, `pauseRuntimeMemory`, `resumeRuntimeMemory`, `listRuntimeMemory`, `applyRuntimeMemoryDelta`, `undoRuntimeMemory`, `forgetRuntimeMemoryObject`, `revokeRuntimeMemory`, `clearRuntimeMemory`. Every method must first resolve the actor’s accessible brother using existing ownership/operator/super-admin rules; operators and super-admins are read-only for another anchor’s memory. Enforce 200 total memories, 20 operations, 200-character values, and source rules matching `memory_store.py`.

`lib/goutoujunshi-runtime/memory.js` must expose pure `memoryNamespace(actorId, brotherId)`, `normalizeMemoryCommand`, and `buildMemoryContext` so the Runtime can be tested without SQLite.

- [ ] **Step 4: Run storage and Runtime memory tests**

Run: `node test-auth-store.cjs && node test-goutoujunshi-runtime-memory.cjs`

Expected: all consent, source, namespace, limit and rollback assertions pass.

- [ ] **Step 5: Commit**

```bash
git add lib/auth-store.cjs lib/goutoujunshi-runtime/memory.js test-auth-store.cjs test-goutoujunshi-runtime-memory.cjs
git commit -m "feat: add isolated goutoujunshi runtime memory"
```

## Task 5: Runtime orchestrator and memory API

**Files:**
- Modify: `test-goutoujunshi-runtime.cjs`
- Create: `lib/goutoujunshi-runtime/index.js`
- Create: `pages/api/chat/runtime-memory.js`
- Create: `test-runtime-memory-api.cjs`

- [ ] **Step 1: Write failing orchestration and API tests**

Add an orchestration test that calls `analyzeGoutoujunshiRuntime` with an injected in-memory memory adapter and asserts stage order, `runtime.version`, `loadedReferences`, `analysis.primaryGoal`, `promptContext`, and no raw credentials. Add API tests for unauthenticated 401, anchor read/write success, operator read-only access, and cross-anchor 403.

```js
const { analyzeGoutoujunshiRuntime } = await import("./lib/goutoujunshi-runtime/index.js");
const result = analyzeGoutoujunshiRuntime({
  actor: { userId: "anchor-1", role: "anchor" },
  subject: { brotherId: "brother-1", alias: "同名大哥" },
  currentMessage: "今天被老板骂了，很难受",
  history: [],
  sources: { works: "户外视频" },
  memoryAdapter: { status: () => ({ enabled: false, paused: false }), context: () => [] },
});
assert.deepEqual(result.runtime.stages, ["emotion", "intake", "evidence", "knowledge", "decision", "action", "memory"]);
assert.equal(result.runtime.name, "goutoujunshi");
assert.ok(result.promptContext.includes("primaryGoal"));
assert.equal(result.promptContext.includes("ZAI_API_KEY"), false);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test-goutoujunshi-runtime.cjs && node test-runtime-memory-api.cjs`

Expected: FAIL because the orchestrator and API route do not exist.

- [ ] **Step 3: Implement orchestrator and API**

`index.js` must call modules in exact order, use an injected adapter in tests and the authenticated store adapter in production, and return `normalizeRuntimeResult`. It must not call GLM or mutate the database except through an explicit memory command.

`pages/api/chat/runtime-memory.js` must accept `GET` for status/context and `POST` commands `{ action, brotherId, consent, delta }`. It must use `requireUser`, resolve brother ownership, return sanitized memory rows, and map `CONSENT_REQUIRED`, `MEMORY_PAUSED`, `SOURCE_NOT_ELIGIBLE`, `MEMORY_LIMIT_REACHED`, `FORBIDDEN` to stable JSON codes. It must never return secrets or original unbounded chat payloads.

- [ ] **Step 4: Run orchestration and API tests**

Run: `node test-goutoujunshi-runtime.cjs && node test-runtime-memory-api.cjs`

Expected: stage order, memory commands and role boundaries pass.

- [ ] **Step 5: Commit**

```bash
git add lib/goutoujunshi-runtime/index.js pages/api/chat/runtime-memory.js test-goutoujunshi-runtime.cjs test-runtime-memory-api.cjs
git commit -m "feat: expose goutoujunshi runtime and memory commands"
```

## Task 6: Replace profile API orchestration with Runtime

**Files:**
- Modify: `pages/api/profile.js`
- Modify: `test-api.cjs`
- Modify: `lib/goutoujunshi-runtime/contract.js`

- [ ] **Step 1: Extend the API contract test before implementation**

In `test-api.cjs`, assert the mocked GLM request contains `runtime.name`, `runtime.stages`, `analysis.facts`, `analysis.unknowns`, `analysis.primaryGoal`, `analysis.decision.stopCondition`, and `runtime.loadedReferences` with hashes. Add a forged-client case where `body.relationshipState.primaryGoal = "收线"` but current message is `在吗`; assert request material remains `承接`. Add a generated candidate containing `给我刷礼物` and assert the API returns `INVALID_AI_POLICY` rather than passing it through.

- [ ] **Step 2: Run the targeted API test to verify it fails**

Run: `node test-api.cjs`

Expected: FAIL because profile requests do not yet contain the Runtime contract and policy validator.

- [ ] **Step 3: Integrate the Runtime**

Replace direct imports of `analyzeGoutoujunshi`, `routeKnowledge`, `loadGoutoujunshiReferences`, and `normalizeRelationshipState` with `analyzeGoutoujunshiRuntime` and `buildPromptContext`. Pass authenticated user and brother scope into Runtime. Keep current rate limit, consent check, provider error mapping, reply style, opening mode, and 4–8 reply schema.

The provider system prompt must state that `runtime` and `analysis` are server-computed hard constraints. The user message must contain the JSON-safe Runtime result and not client-provided relationship state. After parsing GLM JSON, call `validateGenerationAgainstRuntime` before `normalizeAIResult`; map policy drift to 502 `{ code: "INVALID_AI_POLICY" }`. Return:

```js
{
  ...normalizedResult,
  runtime: runtimeResult.runtime,
  intake: runtimeResult.intake,
  analysis: runtimeResult.analysis,
  memory: runtimeResult.memory,
  algorithmCore: runtimeResult.analysis.algorithmCore,
  coreDecision: runtimeResult.analysis.decision,
  replyStyle,
  model,
  provider: "zhipu"
}
```

- [ ] **Step 4: Run targeted API and generation tests**

Run: `node test-api.cjs && node test-generation-contract.cjs`

Expected: existing GLM-5.3 tests plus Runtime state, forged target, policy drift and response fields pass.

- [ ] **Step 5: Commit**

```bash
git add pages/api/profile.js lib/goutoujunshi-runtime/contract.js test-api.cjs
git commit -m "feat: route profile generation through runtime"
```

## Task 7: Chat UI analysis evidence and memory controls

**Files:**
- Modify: `components/chat/ChatWorkspace.js`
- Modify: `components/chat/chat.module.css`
- Modify: `test-generation-contract.cjs`
- Create: `test-goutoujunshi-runtime-ui.cjs`

- [ ] **Step 1: Write failing UI contract tests**

Assert the component source renders labels for `分析依据`, `已确认事实`, `合理推测`, `仍未知`, `本轮参考资料`, `观察窗口`, `停止条件`, `记忆状态`, `暂停记忆`, and `撤销`. Assert there is no automatic send call and that every memory action has `type="button"`.

- [ ] **Step 2: Run UI tests to verify they fail**

Run: `node test-goutoujunshi-runtime-ui.cjs`

Expected: FAIL because the analysis panel and memory controls do not exist.

- [ ] **Step 3: Implement the panel and controls**

Store the API response’s `runtime`, `intake`, `analysis`, and `memory` in the existing per-brother workspace snapshot. Render a collapsed panel after the AI result summary; on mobile, use a single-column disclosure with touch targets of at least 44px. Add buttons that call `/api/chat/runtime-memory/` for status/enable/pause/resume/undo/forget/clear, show success/error feedback, and never expose raw memory database paths or API keys. If Runtime returns `needsProfile`, show no more than three questions and allow the current high-risk response to proceed first.

- [ ] **Step 4: Run UI tests**

Run: `node test-goutoujunshi-runtime-ui.cjs && node test-generation-contract.cjs`

Expected: analysis evidence and memory control assertions pass, with existing candidate persistence unchanged.

- [ ] **Step 5: Commit**

```bash
git add components/chat/ChatWorkspace.js components/chat/chat.module.css test-goutoujunshi-runtime-ui.cjs test-generation-contract.cjs
git commit -m "feat: show runtime analysis evidence in chat"
```

## Task 8: Upstream validation, regression suite, build and handoff

**Files:**
- Modify: `package.json`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

- [ ] **Step 1: Add test commands before final implementation**

Add `"test:runtime": "node test-goutoujunshi-runtime.cjs && node test-goutoujunshi-runtime-memory.cjs && node test-runtime-memory-api.cjs && node test-goutoujunshi-runtime-ui.cjs"` and include it at the beginning of `npm test`.

- [ ] **Step 2: Run the complete verification set**

Run each command separately and record exit code/output in `progress.md`:

```bash
python3 vendor/goutoujunshi/scripts/validate_skill.py
python3 vendor/goutoujunshi/scripts/validate_skill.py --runtime
npm run test:runtime
npm test
git diff --check
```

Expected: both upstream validators print `goutoujunshi validation passed`; Runtime and full test suites exit 0; diff check prints no whitespace errors.

- [ ] **Step 3: Build in a copied isolated directory**

Create a temporary directory with `mktemp -d`, copy the worktree excluding `.git`, `.next`, `node_modules`, copy `node_modules` rather than symlink it, and run `npm run build`. Do not touch the live 3102 process or the real `data/auth.sqlite`. Record the build exit code and generated routes.

- [ ] **Step 4: Run final source and security checks**

Use `rg` to confirm no new code contains `刷礼物|诱导消费|ZAI_API_KEY` in client components, no profile API trusts client `primaryGoal`, and no Runtime path reads outside `vendor/goutoujunshi`. Run `git status --short` and verify only intended files changed.

- [ ] **Step 5: Update plan and commit the completed implementation**

Mark every task complete only after its command passes, append any failures and resolutions to `task_plan.md`, and commit the implementation with:

```bash
git add package.json lib/goutoujunshi-runtime lib/auth-store.cjs pages/api/profile.js pages/api/chat/runtime-memory.js components/chat test-*.cjs task_plan.md findings.md progress.md
git commit -m "feat: implement goutoujunshi local runtime"
```

Final report must separate: Runtime/unit evidence, full app/build evidence, actual GLM provider permission status, and the unchanged boundary that no real Douyin backend is read or written.
