// This module is the executable adapter for the vendored goutoujunshi skill.
// Keep the algorithm deterministic and offline; GLM-5.3 only writes replies
// after this state has been produced and validated by the API route.
// Runtime 边界说明：本文件负责风险、情绪、目标、停止条件和参考资料路由，
// 不负责调用模型，也不接受浏览器传入的“放宽边界”开关。修改这里的判断时，
// 必须同步更新 Runtime 测试，避免 AI 输出绕过服务端状态。

export const GOUTOUJUNSHI_CORE = {
  name: "goutoujunshi",
  source: "https://github.com/shengjidaguai-china/goutoujunshi",
  revision: "6db7354a4002dc7c448a9c87ffdad8132570c9d3",
  contractVersion: "2026-09-29.1",
  workflow: ["情绪落地", "事实拆分", "利益判断", "明确建议", "行动收束"],
};

const MAX_ITEMS = 8;
const WORKFLOW = GOUTOUJUNSHI_CORE.workflow;
const REFERENCES = {
  evidence: "references/knowledge/01-证据分级与内容边界.md",
  reply: "references/practical/实战话术编排器：从一句回复到后续分支.md",
  emotion: "references/knowledge/03-依恋理论与情绪调节.md",
  conflict: "references/knowledge/07-沟通冲突与修复.md",
  intimacy: "references/knowledge/08-同意边界性与亲密.md",
  online: "references/knowledge/09-在线约会与数字关系.md",
  money: "references/knowledge/12-金钱家务育儿与双方家庭.md",
  crisis: "references/knowledge/17-中国法律安全与危机转介.md",
  invitation: "references/practical/主动表达、第一次见面与自然接触.md",
  imbalance: "references/practical/关系投入失衡：互惠判断、降级投入与退出决策.md",
};

function clean(value, max = 600) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, max) : "";
}

function unique(values, max = MAX_ITEMS) {
  return [...new Set(values.filter(Boolean))].slice(0, max);
}

function addEvidence(target, source, text, speaker = "brother", confidence = "medium") {
  const value = clean(text, 800);
  if (!value) return;
  target.push({ source, speaker, text: value, confidence });
}

function detectRisk(message) {
  const types = [];
  if (/自杀|自残|不想活|活不下去|轻生|结束生命/.test(message)) types.push("self_harm");
  if (/威胁|弄死|报复|跟踪|骚扰|曝光隐私/.test(message)) types.push("threat");
  if (/借钱|借我|转账|打钱|周转|发红包|要钱|贵重礼物/.test(message)) types.push("money");
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

function inferFamiliarity(history) {
  if (history.length >= 6) return "长期熟客";
  if (history.length >= 2) return "熟悉";
  return "初识";
}

function derivePrimaryGoal(message, risk, emotion) {
  if (risk.types.includes("self_harm")) return "承接";
  if (risk.level === "high") return "收线";
  if (emotion.intensity >= 5) return "承接";
  if (/周末|有空|出来|见面|想见|一起吃|约你/.test(message)) return "约见";
  if (/为什么|怎么回事|什么意思|到底|方便说说|说清楚/.test(message)) return "澄清";
  if (/生气|误会|不理|拉黑|删掉/.test(message)) return "修复";
  if (/哈哈|笑死|开玩笑|逗你|真的假的/.test(message)) return "调侃";
  return "承接";
}

function selectReferences({ message, risk, emotion, primaryGoal }) {
  const refs = [REFERENCES.evidence, REFERENCES.reply];
  // Keep the upstream reply workflow in every request, then prioritize a
  // safety reference over general emotion or relationship material.
  if (risk.types.includes("self_harm") || risk.types.includes("threat")) refs.push(REFERENCES.crisis);
  else if (risk.types.includes("money")) refs.push(REFERENCES.money);
  else if (risk.types.includes("sexual_or_privacy")) refs.push(REFERENCES.online);
  else if (emotion.intensity >= 5) refs.push(REFERENCES.emotion);
  else if (primaryGoal === "约见") refs.push(REFERENCES.invitation);
  else if (primaryGoal === "澄清" || primaryGoal === "修复") refs.push(REFERENCES.conflict);
  else if (/冷淡|不回|敷衍|单方面|取消/.test(message)) refs.push(REFERENCES.imbalance);
  return unique(refs, 3);
}

function decisionFor(primaryGoal, risk, emotion) {
  const decisions = {
    承接: {
      action: "先回应对方具体感受或事实，再留一个低压力出口",
      observationWindow: "发送后观察对方是否继续提供具体信息，至少等一轮自然回复",
      stopCondition: "对方明确不想聊、持续只回无信息内容，或出现现实安全风险",
    },
    降压: {
      action: "减少追问，给对方明确的休息和回到对话的空间",
      observationWindow: "观察后续是否由对方主动带回具体话题，不连续补发",
      stopCondition: "对方明确拒绝或连续多轮没有互惠投入",
    },
    调侃: {
      action: "只接住当前玩笑，轻轻抛回一个可接可不接的球",
      observationWindow: "观察对方是否继续接梗或主动延展，不把沉默当同意",
      stopCondition: "对方语气转冷、表示不舒服或不再接住玩笑",
    },
    轻推: {
      action: "把泛聊向前推进一小步，不同时叠加表白、盘问和邀约",
      observationWindow: "观察对方是否给出具体时间、兴趣或新的主动信号",
      stopCondition: "对方回避、拒绝或长期没有实际互惠",
    },
    约见: {
      action: "提出一个具体、低压力、可拒绝的时间和活动选项",
      observationWindow: "观察对方是否给出明确时间或替代方案，不连环追问",
      stopCondition: "明确拒绝、持续取消且不给替代时间，或现场安全条件不合适",
    },
    澄清: {
      action: "只问一个会改变判断的关键事实，允许对方暂不回答",
      observationWindow: "等待对方给出明确事实，不用第二段解释逼出答案",
      stopCondition: "对方拒绝说明、话题升级为冲突或继续追问会侵犯边界",
    },
    修复: {
      action: "承认可确认的影响，围绕当前一件事给出修复或暂停选项",
      observationWindow: "观察对方是否愿意说明具体问题或共同调整下一步",
      stopCondition: "对方明确不愿继续、出现威胁或反复伤害边界",
    },
    收线: {
      action: "清楚表达边界并停止当前推进，不用亲密承诺换取回应",
      observationWindow: "发送后不连续解释，等待对方是否以尊重边界的方式回应",
      stopCondition: "对方再次施压、威胁、索要隐私/金钱或明确拒绝联系",
    },
  };
  const base = decisions[primaryGoal] || decisions.承接;
  if (risk.level === "high") {
    return {
      ...base,
      action: primaryGoal === "承接" ? "先承接当下情绪并确认安全，不推进关系或消费" : "优先保护主播边界，必要时停止对话并寻求现实支持",
      stopCondition: "出现威胁、胁迫、自伤风险、隐私索取或持续越界",
    };
  }
  if (emotion.intensity >= 7) return { ...base, action: "先把对方拉回当下感受和可执行的小事，不急于讲道理或推进关系" };
  return base;
}

export function analyzeGoutoujunshi({ currentMessage = "", history = [], sources = {}, localAnalysis = {} } = {}) {
  const message = clean(currentMessage, 800);
  const safeHistory = Array.isArray(history)
    ? history.filter(row => row && (clean(row.msg || row.message) || clean(row.reply || row.response))).slice(0, 10)
    : [];
  const safeSources = sources && typeof sources === "object" ? sources : {};
  const risk = detectRisk(message);
  const emotion = detectEmotion(message);
  const primaryGoal = derivePrimaryGoal(message, risk, emotion);
  const facts = [];
  const inferences = [];
  const unknowns = [];
  const evidence = [];

  if (message) {
    facts.push(`对方当前发言：${message}`);
    addEvidence(evidence, "current_message", message, "brother", "high");
  } else {
    unknowns.push("对方当前具体发言未知");
  }
  if (localAnalysis?.scenarioLabel) facts.push(`本地规则识别场景：${clean(localAnalysis.scenarioLabel, 80)}`);

  const sourceFields = [
    ["works", "作品文案", "brother"],
    ["comments", "近期评论", "brother"],
    ["statements", "公开发言或聊天片段", "unknown"],
  ];
  for (const [key, label, speaker] of sourceFields) {
    const text = clean(safeSources[key], 6000);
    if (!text) continue;
    facts.push(`已提供${label}素材（不等于完整人格结论）`);
    addEvidence(evidence, key, text, speaker, "medium");
  }

  const replyCount = safeHistory.filter(row => clean(row.reply || row.response)).length;
  if (emotion.intensity >= 5) inferences.push("当前更适合先回应情绪，再决定是否继续追问或推进");
  if (risk.level === "high") inferences.push("当前请求需要先保护主播边界，不宜用亲密承诺换取回应");
  if (replyCount >= 2) inferences.push("历史中存在至少两轮有来有回的互动");
  if (!safeHistory.length) unknowns.push("双方熟悉程度和近期互动趋势未知");
  if (!safeSources.works && !safeSources.comments && !safeSources.statements) unknowns.push("缺少可用于画像的公开或授权素材");
  if (safeHistory.length < 2) unknowns.push("是否存在稳定互惠投入仍需更多互动验证");

  const reciprocity = replyCount >= 2
    ? [{ signal: "历史中有多次双方回复", direction: "positive" }]
    : safeHistory.length
      ? [{ signal: "已有历史互动，但互惠程度证据不足", direction: "unclear" }]
      : [{ signal: "暂无历史互动证据", direction: "unclear" }];
  const decision = decisionFor(primaryGoal, risk, emotion);
  const selectedReferences = selectReferences({ message, risk, emotion, primaryGoal });

  return {
    facts: unique(facts),
    inferences: unique(inferences),
    unknowns: unique(unknowns),
    evidence: evidence.slice(0, MAX_ITEMS),
    emotion,
    risk,
    primaryGoal,
    familiarity: inferFamiliarity(safeHistory),
    reciprocity,
    decision,
    workflow: WORKFLOW,
    algorithmCore: {
      name: GOUTOUJUNSHI_CORE.name,
      source: GOUTOUJUNSHI_CORE.source,
      revision: GOUTOUJUNSHI_CORE.revision,
      contractVersion: GOUTOUJUNSHI_CORE.contractVersion,
      workflow: WORKFLOW,
      selectedReferences,
    },
  };
}
