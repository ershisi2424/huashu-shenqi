import { PRIMARY_GOALS, RUNTIME_META } from "./constants.js";

function clean(value, max = 800) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, max) : "";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function detectRisk(message) {
  const types = [];
  if (/自杀|自残|不想活|活不下去|轻生|结束生命/.test(message)) types.push("self_harm");
  if (/威胁|弄死|报复|跟踪|骚扰|曝光隐私/.test(message)) types.push("threat");
  if (/借钱|借我|转账|打钱|周转|发红包|要钱|贵重礼物|刷.*(礼物|嘉年华)|嘉年华/.test(message)) types.push("money");
  if (/裸聊|约炮|开房|色情|私照|发张.*(照片|视频)|看看.*(腿|胸|身材)/.test(message)) types.push("sexual_or_privacy");
  return { level: types.length ? "high" : "none", types };
}

function detectEmotion(message) {
  const severe = /绝望|不想活|活不下去|崩溃|轻生|自杀|自残/.test(message);
  const matches = message.match(/累|难受|被骂|委屈|不想干|烦|失眠|睡不着|压力|焦虑|伤心|难过|孤单/g) || [];
  return {
    label: severe ? "高强度负面情绪" : matches.length ? "负面情绪" : "未明确",
    intensity: severe ? 9 : Math.min(8, matches.length ? 4 + matches.length : 0),
    evidence: unique(matches),
  };
}

function derivePrimaryGoal(message, risk, emotion) {
  if (/别再联系|不要联系|不想聊|别烦|滚开|拉黑我|不用回/.test(message)) return "收线";
  if (risk.types.includes("self_harm")) return "承接";
  if (risk.level === "high") return "收线";
  if (emotion.intensity >= 5) return "承接";
  if (/周末|有空|出来|见面|想见|一起吃|约你/.test(message)) return "约见";
  if (/为什么|怎么回事|什么意思|到底|方便说说|说清楚/.test(message)) return "澄清";
  if (/生气|误会|不理|拉黑|删掉/.test(message)) return "修复";
  if (/哈哈|笑死|开玩笑|逗你|真的假的/.test(message)) return "调侃";
  return "承接";
}

function decisionFor(primaryGoal, risk, emotion) {
  const table = {
    承接: ["先回应对方具体感受或事实，再留一个低压力出口", "观察对方是否继续提供具体信息，不连续补发", "对方明确不想聊、持续只回无信息内容或出现现实安全风险"],
    降压: ["减少追问，给对方休息和回到对话的空间", "观察是否由对方主动带回具体话题，不连续补发", "对方明确拒绝或连续多轮没有互惠投入"],
    调侃: ["只接住当前玩笑，轻轻抛回一个可接可不接的球", "观察对方是否继续接梗，不把沉默当同意", "对方语气转冷、表示不舒服或不再接住玩笑"],
    轻推: ["把泛聊向前推进一小步，不叠加表白、盘问和邀约", "观察对方是否给出具体时间、兴趣或新的主动信号", "对方回避、拒绝或长期没有实际互惠"],
    约见: ["提出一个具体、低压力、可拒绝的时间和活动选项", "观察对方是否给出明确时间或替代方案，不连环追问", "明确拒绝、持续取消且不给替代时间，或安全条件不合适"],
    澄清: ["只问一个会改变判断的关键事实，允许对方暂不回答", "等待对方给出明确事实，不用第二段解释逼出答案", "对方拒绝说明、话题升级为冲突或继续追问会侵犯边界"],
    修复: ["承认可确认的影响，围绕当前一件事给出修复或暂停选项", "观察对方是否愿意说明具体问题或共同调整下一步", "对方明确不愿继续、出现威胁或反复伤害边界"],
    收线: ["清楚表达边界并停止当前推进，不用亲密承诺换取回应", "发送后不连续解释，等待对方是否尊重边界", "对方再次施压、威胁、索要隐私/金钱或明确拒绝联系"],
  };
  const [action, observationWindow, stopCondition] = table[primaryGoal] || table.承接;
  if (risk.level === "high") {
    return {
      action: risk.types.includes("self_harm") ? "先承接当下情绪并确认安全，不推进关系或消费" : "优先保护主播边界，必要时停止对话并寻求现实支持",
      observationWindow,
      stopCondition: "出现威胁、胁迫、自伤风险、隐私索取或持续越界",
    };
  }
  if (emotion.intensity >= 7) return { action: "先把对方拉回当下感受和可执行的小事，不急于讲道理或推进关系", observationWindow, stopCondition };
  return { action, observationWindow, stopCondition };
}

export function decide({ message = "", history = [], evidence = {} } = {}) {
  const currentMessage = clean(message);
  const risk = detectRisk(currentMessage);
  const emotion = detectEmotion(currentMessage);
  const primaryGoal = derivePrimaryGoal(currentMessage, risk, emotion);
  const safeHistory = Array.isArray(history) ? history : [];
  const replyCount = safeHistory.filter((row) => clean(row?.reply || row?.response)).length;
  const familiarity = safeHistory.length >= 6 ? "长期熟客" : safeHistory.length >= 2 ? "熟悉" : "初识";
  const reciprocity = replyCount >= 2
    ? [{ signal: "历史中有多次双方回复", direction: "positive" }]
    : safeHistory.length
      ? [{ signal: "已有历史互动，但互惠程度证据不足", direction: "unclear" }]
      : [{ signal: "暂无历史互动证据", direction: "unclear" }];
  const decision = decisionFor(primaryGoal, risk, emotion);
  const emotionLanding = emotion.intensity > 0
    ? [`对方当前表达出${emotion.label}，可确认信号是${emotion.evidence.join("、") || "当前措辞"}。`, "先回应这段具体感受，不替对方补充未经确认的动机。"]
    : ["当前消息没有足够的明确情绪信号。", "先接住具体事实，再观察对方是否愿意展开。"];
  const opportunityCost = {
    benefits: primaryGoal === "收线" ? ["减少继续越界和误解的成本"] : ["保留一次自然回应和观察互惠的机会"],
    costs: primaryGoal === "收线" ? ["可能暂时失去继续解释的机会"] : ["如果对方没有继续投入，连续推进会消耗主播时间和边界"],
    unknowns: ["对方下一轮是否愿意具体回应仍未知"],
  };
  return {
    emotion,
    emotionLanding,
    risk,
    primaryGoal: PRIMARY_GOALS.includes(primaryGoal) ? primaryGoal : "承接",
    familiarity,
    reciprocity,
    opportunityCost,
    decision,
    observationWindow: decision.observationWindow,
    stopCondition: decision.stopCondition,
    facts: Array.isArray(evidence.facts) ? evidence.facts : [],
    inferences: Array.isArray(evidence.inferences) ? evidence.inferences : [],
    unknowns: Array.isArray(evidence.unknowns) ? evidence.unknowns : [],
    workflow: ["情绪落地", "事实拆分", "利益判断", "明确建议", "行动收束"],
    algorithmCore: {
      name: RUNTIME_META.name,
      source: RUNTIME_META.source,
      revision: RUNTIME_META.sourceRevision,
      contractVersion: RUNTIME_META.version,
      workflow: ["情绪落地", "事实拆分", "利益判断", "明确建议", "行动收束"],
    },
  };
}
