const MAX_TEXT = 240;

function text(value, limit = MAX_TEXT) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, limit) : "";
}

function list(value, limit = 8) {
  return Array.isArray(value)
    ? value.map((item) => text(typeof item === "string" ? item : item?.text || item?.statement || item?.content || item?.signal || item?.reason, MAX_TEXT)).filter(Boolean).slice(0, limit)
    : [];
}

function scoreEmotion(emotion) {
  const value = Number(emotion?.intensity);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 10)));
}

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
  const primaryGoal = text(analysis.primaryGoal, 40) || "承接";
  const familiarity = text(analysis.familiarity, 40) || "未知";
  const riskHigh = risk.level === "high";
  const emotionIntensity = scoreEmotion(emotion);
  const facts = list(analysis.facts);
  const unknowns = list(analysis.unknowns);
  const riskTypes = list(risk.types, 6);
  const replyHints = [
    text(decision.action),
    text(decision.observationWindow || analysis.observationWindow),
    facts[0] ? `优先回应已确认事实：${facts[0]}` : "只使用当前已确认信息",
    unknowns[0] ? `保持未知：${unknowns[0]}` : "信息不足时不要替对方补充动机",
  ].filter(Boolean).slice(0, 4);
  const relationshipState = payload.relationshipState && typeof payload.relationshipState === "object"
    ? payload.relationshipState
    : analysis;
  return {
    runtimeOnly: true,
    scenarioKey: "runtime",
    scenarioLabel: `Runtime · ${primaryGoal}`,
    brotherType: familiarity,
    suggestIntensity: riskHigh ? "warmup" : emotionIntensity >= 50 ? "daily" : "daily",
    emotionIntensity,
    riskScore: riskHigh ? 100 : 0,
    crossLine: riskHigh,
    crossLineType: riskTypes.join("、"),
    interactStage: familiarity,
    replyDifficulty: riskHigh ? "高危" : emotionIntensity >= 50 ? "困难" : "简单",
    intent: text(decision.action, 300) || primaryGoal,
    replyHints,
    primaryGoal,
    familiarity,
    facts,
    unknowns,
    risk: { level: text(risk.level, 30) || "none", types: riskTypes },
    emotion: { label: text(emotion.label, 80) || "未明确", intensity: Number.isFinite(Number(emotion.intensity)) ? Number(emotion.intensity) : 0, evidence: list(emotion.evidence, 6) },
    decision: {
      action: text(decision.action, 300),
      observationWindow: text(decision.observationWindow || analysis.observationWindow, 300),
      stopCondition: text(decision.stopCondition || analysis.stopCondition, 300),
    },
    _relationshipState: relationshipState,
    _runtimeAnalysis: analysis,
    _aiProfile: payload.profile && typeof payload.profile === "object" ? payload.profile : null,
  };
}

module.exports = { projectRuntimeAnalysis };
