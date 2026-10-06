import { PRIMARY_GOALS, RUNTIME_META, STAGES } from "./constants.js";

// Runtime 输出契约说明：Runtime 结果是 GLM-5.3 的上游控制面，
// normalizeRuntimeResult 固定字段形状，validateGenerationAgainstRuntime
// 在服务端拒绝越过主目标、风险和边界的可发送文本。不要把内部 rationale
// 或 stopCondition 当作可直接发送给对方的消息。

function text(value, max = 800) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, max) : "";
}

function array(value, max = 8) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function policyError(message) {
  const error = new Error(message);
  error.code = "INVALID_AI_POLICY";
  return error;
}

function generatedSendableText(generated = {}) {
  const replies = Array.isArray(generated?.replies) ? generated.replies : [];
  const replyText = replies.map((item) => text(item?.text, 1200)).filter(Boolean);
  const inviteText = text(generated?.liveInvite?.text, 1200);
  return [...replyText, inviteText].filter(Boolean).join("\n");
}

export function normalizeRuntimeResult(value = {}) {
  const runtime = value.runtime && typeof value.runtime === "object" ? value.runtime : {};
  const sourceAnalysis = value.analysis && typeof value.analysis === "object" ? value.analysis : {};
  const primaryGoal = PRIMARY_GOALS.includes(sourceAnalysis.primaryGoal) ? sourceAnalysis.primaryGoal : "承接";
  const decision = sourceAnalysis.decision && typeof sourceAnalysis.decision === "object" ? sourceAnalysis.decision : {};
  return {
    runtime: {
      ...RUNTIME_META,
      ...runtime,
      name: RUNTIME_META.name,
      version: RUNTIME_META.version,
      sourceRevision: RUNTIME_META.sourceRevision,
      stages: array(runtime.stages, STAGES.length).length ? array(runtime.stages, STAGES.length) : STAGES,
      loadedReferences: array(runtime.loadedReferences, 3).map((item) => ({
        path: text(item?.path, 200), reason: text(item?.reason, 160), sha256: text(item?.sha256, 64),
      })).filter((item) => item.path),
    },
    intake: {
      needsProfile: value.intake?.needsProfile === true,
      missingFields: array(value.intake?.missingFields, 8).map((item) => text(item, 80)).filter(Boolean),
      questions: array(value.intake?.questions, 3).map((item) => text(item, 240)).filter(Boolean),
      confirmedProfile: value.intake?.confirmedProfile && typeof value.intake.confirmedProfile === "object" ? value.intake.confirmedProfile : {},
    },
    analysis: {
      emotionLanding: array(sourceAnalysis.emotionLanding, 4).map((item) => text(item, 240)).filter(Boolean),
      facts: array(sourceAnalysis.facts).slice(0, 8),
      inferences: array(sourceAnalysis.inferences).slice(0, 8),
      unknowns: array(sourceAnalysis.unknowns).slice(0, 8),
      contradictions: array(sourceAnalysis.contradictions).slice(0, 8),
      evidence: array(sourceAnalysis.evidence).slice(0, 8),
      emotion: sourceAnalysis.emotion && typeof sourceAnalysis.emotion === "object" ? sourceAnalysis.emotion : { label: "未明确", intensity: 0, evidence: [] },
      familiarity: text(sourceAnalysis.familiarity, 40) || "未知",
      reciprocity: array(sourceAnalysis.reciprocity, 6),
      opportunityCost: sourceAnalysis.opportunityCost && typeof sourceAnalysis.opportunityCost === "object" ? sourceAnalysis.opportunityCost : { benefits: [], costs: [], unknowns: [] },
      risk: sourceAnalysis.risk && typeof sourceAnalysis.risk === "object" ? sourceAnalysis.risk : { level: "none", types: [] },
      primaryGoal,
      decision: {
        action: text(decision.action, 240) || `围绕“${primaryGoal}”只完成一个主要动作`,
        observationWindow: text(decision.observationWindow, 240) || "观察对方是否提供新的具体信息，不连续补发",
        stopCondition: text(decision.stopCondition, 240) || "对方明确拒绝、持续没有互惠或出现边界风险",
      },
      observationWindow: text(sourceAnalysis.observationWindow, 240) || text(decision.observationWindow, 240),
      stopCondition: text(sourceAnalysis.stopCondition, 240) || text(decision.stopCondition, 240),
      algorithmCore: sourceAnalysis.algorithmCore && typeof sourceAnalysis.algorithmCore === "object" ? sourceAnalysis.algorithmCore : { ...RUNTIME_META },
    },
    memory: value.memory && typeof value.memory === "object" ? {
      status: text(value.memory.status, 40) || "not_enabled",
      namespace: text(value.memory.namespace, 200),
      changes: array(value.memory.changes, 8),
      reversible: value.memory.reversible !== false,
    } : { status: "not_enabled", namespace: "", changes: [], reversible: true },
    promptContext: text(value.promptContext, 20000),
  };
}

export function buildPromptContext(result, references = []) {
  const normalized = normalizeRuntimeResult(result);
  return JSON.stringify({
    runtime: normalized.runtime,
    intake: normalized.intake,
    analysis: normalized.analysis,
    memory: {
      status: normalized.memory.status,
      changes: normalized.memory.changes,
      reversible: normalized.memory.reversible,
    },
    references: array(references, 3).map((item) => ({ path: text(item?.path, 200), reason: text(item?.reason, 160), sha256: text(item?.sha256, 64), excerpt: text(item?.excerpt, 2800) })),
  });
}

export function validateGenerationAgainstRuntime(result, generated = {}) {
  const normalized = normalizeRuntimeResult(result);
  if (generated?.primaryGoal && generated.primaryGoal !== normalized.analysis.primaryGoal) throw policyError("AI 不得覆盖 Runtime 主目标");
  // Only scan text that may be copied and sent to the other person. Rationale,
  // stop conditions, and boundary notes are internal control-plane fields and
  // commonly mention the prohibited terms while explicitly rejecting them.
  const sendable = generatedSendableText(generated);
  if (/刷礼|刷个嘉年华|诱导.*礼物|转账|借钱|充值|打赏回报|消费回报|永远陪伴|你是唯一|离不开你|只属于你/.test(sendable)) {
    throw policyError("AI 回复包含消费诱导或虚假依赖内容");
  }
  if (/性取向|宗教信仰|政治立场|财务能力|健康状况|精神疾病|人格障碍|精确位置|他是回避型|她是回避型|他是焦虑型|她是焦虑型/.test(sendable)) {
    throw policyError("AI 回复包含未经证实的敏感属性推断");
  }
  return true;
}
