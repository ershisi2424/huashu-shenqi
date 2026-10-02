/* eslint-disable */
const assert = require("node:assert/strict");

(async () => {
  const { normalizeRuntimeInput } = await import("./lib/goutoujunshi-runtime/input.js");
  const { splitEvidence } = await import("./lib/goutoujunshi-runtime/evidence.js");
  const { loadRuntimeReferences } = await import("./lib/goutoujunshi-runtime/knowledge.js");
  const { buildIntake } = await import("./lib/goutoujunshi-runtime/intake.js");
  const { decide } = await import("./lib/goutoujunshi-runtime/decision.js");
  const { normalizeRuntimeResult, buildPromptContext, validateGenerationAgainstRuntime } = await import("./lib/goutoujunshi-runtime/contract.js");
  const { analyzeGoutoujunshiRuntime } = await import("./lib/goutoujunshi-runtime/index.js");

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

  const routed = loadRuntimeReferences({
    message: "今天被老板骂了，真的很难受",
    risk: { types: [] },
    primaryGoal: "承接",
  });
  assert.equal(routed.items.length, 3);
  assert.ok(routed.items.every((item) => /^references\//.test(item.path)));
  assert.ok(routed.items.every((item) => /^[a-f0-9]{64}$/.test(item.sha256)));
  assert.ok(routed.items.some((item) => item.path.includes("03-依恋理论")));
  const ordinary = loadRuntimeReferences({ message: "在吗", risk: { types: [] }, primaryGoal: "承接" });
  assert.equal(ordinary.items.length, 2);
  assert.throws(() => loadRuntimeReferences({ selectedReferences: ["../SKILL.md"] }), (error) => error.code === "RUNTIME_REFERENCE_NOT_ALLOWED");

  const first = buildIntake({ profile: {}, currentMessage: "在吗", urgent: false });
  assert.equal(first.needsProfile, true);
  assert.ok(first.questions.length >= 1 && first.questions.length <= 3);
  const urgent = buildIntake({ profile: {}, currentMessage: "我不想活了", urgent: true });
  assert.equal(urgent.needsProfile, false);

  const distress = decide({ message: "最近压力很大，真的不想干了", history: [], evidence: { facts: [], inferences: [], unknowns: [] } });
  assert.equal(distress.primaryGoal, "承接");
  assert.equal(distress.emotion.label, "负面情绪");
  assert.ok(distress.decision.stopCondition);
  assert.ok(distress.emotionLanding.length >= 1);

  const money = decide({ message: "给你刷个嘉年华", history: [], evidence: { facts: [], inferences: [], unknowns: [] } });
  assert.equal(money.risk.types.includes("money"), true);
  assert.ok(/边界|不推进|自愿/.test(money.decision.action + money.decision.stopCondition));

  const refusal = decide({ message: "别再联系我了", history: [], evidence: { facts: [], inferences: [], unknowns: [] } });
  assert.equal(refusal.primaryGoal, "收线");
  assert.ok(refusal.stopCondition);

  const normalized = normalizeRuntimeResult({
    runtime: { name: "goutoujunshi" },
    analysis: { primaryGoal: "承接", facts: ["对方当前发言：在吗"], unknowns: ["熟悉程度未知"], decision: { action: "先承接" } },
  });
  assert.equal(normalized.runtime.name, "goutoujunshi");
  assert.equal(normalized.analysis.primaryGoal, "承接");
  assert.ok(buildPromptContext(normalized, routed.items).includes("primaryGoal"));
  assert.throws(() => validateGenerationAgainstRuntime(normalized, { replies: [{ text: "哥给我刷礼物，我才开心" }] }), (error) => error.code === "INVALID_AI_POLICY");
  assert.throws(() => validateGenerationAgainstRuntime(normalized, { primaryGoal: "收线", replies: [] }), (error) => error.code === "INVALID_AI_POLICY");

  const runtimeResult = analyzeGoutoujunshiRuntime({
    actor: { userId: "anchor-1", role: "anchor" },
    subject: { brotherId: "brother-1", alias: "同名大哥" },
    currentMessage: "今天被老板骂了，很难受",
    history: [],
    sources: { works: "户外视频" },
    memoryAdapter: {
      status: () => ({ consentEnabled: false, paused: false }),
      context: () => [],
    },
  });
  assert.deepEqual(runtimeResult.runtime.stages, ["emotion", "intake", "evidence", "knowledge", "decision", "action", "memory"]);
  assert.equal(runtimeResult.runtime.name, "goutoujunshi");
  assert.ok(runtimeResult.promptContext.includes("primaryGoal"));
  assert.equal(runtimeResult.promptContext.includes("ZAI_API_KEY"), false);
  console.log("runtime input/evidence red contract reached");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
