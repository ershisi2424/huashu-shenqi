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
assert.equal(projectRuntimeAnalysis(null), null);

console.log("test-runtime-ui-projection: ok");
