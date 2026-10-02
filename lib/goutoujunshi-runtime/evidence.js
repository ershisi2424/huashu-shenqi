import { MAX_LIMITS } from "./constants.js";

function clean(value, limit = 800) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, limit) : "";
}

function unique(items, max = MAX_LIMITS.evidence) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item?.source || ""}|${item?.text || ""}`;
    if (!item?.text || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, max);
}

function evidenceItem(source, text, speaker, confidence) {
  const value = clean(text);
  return value ? { source, speaker, text: value, confidence } : null;
}

export function splitEvidence(input = {}) {
  const facts = [];
  const inferences = [];
  const unknowns = [];
  const contradictions = [];
  const evidence = [];
  const currentMessage = clean(input.currentMessage);
  if (currentMessage) {
    facts.push({ text: `对方当前发言：${currentMessage}`, source: "current_message", confidence: "high" });
    evidence.push(evidenceItem("current_message", currentMessage, "brother", "high"));
  } else {
    unknowns.push({ text: "对方当前具体发言未知", source: "input" });
  }

  const fields = [
    ["works", "作品文案", "brother"],
    ["comments", "近期评论", "brother"],
    ["statements", "公开发言或聊天片段", "unknown"],
    ["transcript", "通话转写", "unknown"],
    ["ocrMessages", "截图识别文字", "unknown"],
  ];
  for (const [key, label, speaker] of fields) {
    const value = clean(input.sources?.[key], 6000);
    if (!value) continue;
    facts.push({ text: `已提供${label}素材（不等于完整人格结论）`, source: key, confidence: "medium" });
    evidence.push(evidenceItem(key, value, speaker, "medium"));
  }

  if (!input.profile || !Object.keys(input.profile).length) unknowns.push({ text: "用户或维护对象的确认档案尚未建立", source: "profile" });
  if (!Array.isArray(input.history) || input.history.length < 2) unknowns.push({ text: "双方熟悉程度和近期互动趋势未知", source: "history" });
  if (!input.sources?.works && !input.sources?.comments && !input.sources?.statements) unknowns.push({ text: "缺少可用于画像的公开或授权素材", source: "sources" });
  if (input.speakerMapping?.confirmed !== true) unknowns.push({ text: "截图或混合素材的说话人映射尚未由主播确认", source: "speaker_mapping" });

  const replies = (input.history || []).filter((row) => clean(row.reply || row.response));
  if (replies.length >= 2) inferences.push({ text: "历史中存在至少两轮有来有回的互动", basis: "history" });
  if (input.history?.some((row) => row.sender === "unknown")) unknowns.push({ text: "部分历史消息的说话人无法确认", source: "history" });

  return {
    facts: unique(facts),
    inferences: unique(inferences),
    unknowns: unique(unknowns),
    contradictions: unique(contradictions),
    evidence: evidence.filter(Boolean).slice(0, MAX_LIMITS.evidence),
  };
}
