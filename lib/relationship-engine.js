const MAX_ITEMS = 8;

function clean(value, max = 240) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, max) : "";
}

function bounded(values, max = MAX_ITEMS) {
  return [...new Set(values.filter(Boolean))].slice(0, max);
}

function evidence(source, text, confidence = "medium", speaker = "brother") {
  const value = clean(text, 240);
  return value ? [{ source, speaker, text: value, confidence }] : [];
}

function detectRisk(message) {
  const risks = [];
  if (/自杀|自残|不想活|活不下去|轻生|结束生命/.test(message)) risks.push("self_harm");
  if (/威胁|弄死|报复|跟踪|骚扰|曝光隐私/.test(message)) risks.push("threat");
  if (/借钱|借我|转账|打钱|周转|发红包|要钱/.test(message)) risks.push("money");
  if (/裸聊|约炮|开房|色情|私照|发张.*(照片|视频)|看看.*(腿|胸|身材)/.test(message)) risks.push("sexual_or_privacy");
  if (!risks.length) return { level: "none", types: [] };
  return { level: risks.includes("self_harm") || risks.includes("threat") ? "high" : "high", types: risks };
}

function detectEmotion(message) {
  const severe = /绝望|不想活|活不下去|崩溃|轻生|自杀|自残/.test(message);
  const matches = message.match(/累|难受|被骂|委屈|不想干|烦|失眠|睡不着|压力|焦虑|伤心|难过/g) || [];
  const intensity = severe ? 9 : Math.min(8, matches.length ? 4 + matches.length : 0);
  return {
    label: severe ? "高强度负面情绪" : matches.length ? "负面情绪" : "未明确",
    intensity,
    evidence: bounded(matches),
  };
}

function inferFamiliarity(history) {
  if (history.length >= 6) return "长期熟客";
  if (history.length >= 2) return "熟悉";
  return "初识";
}

function derivePrimaryGoal(message, risk, emotion) {
  if (risk.types.includes("self_harm")) return "承接";
  if (risk.level === "high") return "收线";
  if (emotion.intensity >= 5) return "承接";
  if (/周末|有空|出来|见面|想见|一起吃|约你/.test(message)) return "轻推";
  if (/为什么|怎么回事|什么意思|到底|方便说说/.test(message)) return "澄清";
  if (/哈哈|笑死|开玩笑|逗你|真的假的/.test(message)) return "调侃";
  return "承接";
}

export function deriveRelationshipState({
  currentMessage = "",
  history = [],
  aiSources = {},
  localAnalysis = {},
} = {}) {
  const message = clean(currentMessage, 800);
  const safeHistory = Array.isArray(history)
    ? history.filter(row => row && (clean(row.msg) || clean(row.message))).slice(0, 10)
    : [];
  const risk = detectRisk(message);
  const emotion = detectEmotion(message);
  const primaryGoal = derivePrimaryGoal(message, risk, emotion);
  const facts = [];
  const inferences = [];
  const unknowns = [];
  let evidenceItems = evidence("current_message", message, "high");

  if (message) facts.push(`对方当前发言：${message}`);
  if (localAnalysis?.scenarioLabel) facts.push(`本地规则识别场景：${clean(localAnalysis.scenarioLabel, 80)}`);
  if (localAnalysis?.crossLine) facts.push(`本地规则标记风险：${clean(localAnalysis.crossLineType || "越界请求", 80)}`);

  const sourceFields = [
    ["works", "作品文案", "brother"],
    ["comments", "近期评论", "brother"],
    ["statements", "公开发言或聊天片段", "unknown"],
  ];
  for (const [key, label, speaker] of sourceFields) {
    const text = clean(aiSources?.[key], 6000);
    if (!text) continue;
    facts.push(`已提供${label}素材`);
    evidenceItems = evidenceItems.concat(evidence(key, text, "medium", speaker));
  }

  if (emotion.intensity >= 5) inferences.push("当前更适合先回应情绪，再决定是否继续追问或推进");
  if (risk.level === "high" && !risk.types.includes("self_harm")) inferences.push("当前请求需要先保护主播边界，不宜用亲密承诺换取回应");
  if (safeHistory.length > 0) {
    const hasReplies = safeHistory.some(row => clean(row.reply || row.response));
    if (hasReplies) inferences.push("历史中存在至少一轮有来有回的互动");
  }

  if (!message) unknowns.push("对方当前具体发言未知");
  if (!safeHistory.length) unknowns.push("双方熟悉程度和近期互动趋势未知");
  if (!aiSources?.works && !aiSources?.comments && !aiSources?.statements) unknowns.push("缺少可用于画像的公开或授权素材");
  if (!unknowns.length && safeHistory.length < 2) unknowns.push("是否存在稳定互惠投入仍需更多互动验证");

  const reciprocity = [];
  const replyCount = safeHistory.filter(row => clean(row.reply || row.response)).length;
  if (replyCount >= 2) reciprocity.push({ signal: "历史中有多次双方回复", direction: "positive" });
  else if (safeHistory.length > 0) reciprocity.push({ signal: "已有历史互动，但互惠程度证据不足", direction: "unclear" });
  else reciprocity.push({ signal: "暂无历史互动证据", direction: "unclear" });

  return {
    facts: bounded(facts),
    inferences: bounded(inferences),
    unknowns: bounded(unknowns),
    evidence: evidenceItems.slice(0, MAX_ITEMS),
    emotion,
    risk,
    primaryGoal,
    familiarity: inferFamiliarity(safeHistory),
    reciprocity,
  };
}
