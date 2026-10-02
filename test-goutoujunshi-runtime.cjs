/* eslint-disable */
const assert = require("node:assert/strict");

(async () => {
  const { normalizeRuntimeInput } = await import("./lib/goutoujunshi-runtime/input.js");
  const { splitEvidence } = await import("./lib/goutoujunshi-runtime/evidence.js");
  const { loadRuntimeReferences } = await import("./lib/goutoujunshi-runtime/knowledge.js");

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
  console.log("runtime input/evidence red contract reached");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
