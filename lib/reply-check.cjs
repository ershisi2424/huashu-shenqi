const MAX_REPLY_LENGTH = 800;

// 发送前校验说明：这是主播点击发送前的补充提醒，不替代服务端 Runtime
// 校验，也不会自动发送或改写主播内容。规则只针对当前草稿和最近回复，
// 用于提示重复、过度承诺、隐私/账号风险及消费导向表达。

const RULES = [
  { pattern: /(转账|打钱|发红包|送礼|刷礼|礼物|充值|打赏)/i, warning: "包含礼物或金钱导向表达，容易让对方感到被索取" },
  { pattern: /(只有你|唯一|离不开你|没你不行|不送.*不开心|不送.*不理)/i, warning: "包含唯一性或依赖表达，建议改成真诚感谢并保留边界" },
  { pattern: /(保证|一定能|绝对没问题|永远会|必须马上)/i, warning: "包含过度承诺或催促，建议换成更稳妥的表达" },
  { pattern: /(私下见面|身份证|验证码|密码|裸照|借钱)/i, warning: "触及隐私、账号或高风险请求，发送前请人工确认" },
];

function clean(value, max = 2000) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, max) : "";
}

function checkReplyDraft({ draft, currentMessage = "", recentReplies = [] } = {}) {
  const text = clean(draft, MAX_REPLY_LENGTH + 1);
  const warnings = [];
  const suggestions = [];
  if (!text) {
    return { level: "block", warnings: ["回复内容不能为空"], suggestions: ["先输入一句符合当前语境的回复，再进行发送前检查"] };
  }
  if (text.length > MAX_REPLY_LENGTH) {
    warnings.push(`回复超过 ${MAX_REPLY_LENGTH} 字，长消息可能降低自然度`);
    suggestions.push("拆成两到三句，保留最贴近当前话题的部分");
  }
  for (const rule of RULES) {
    if (rule.pattern.test(text)) warnings.push(rule.warning);
  }
  const normalized = text.replace(/[\s，。！？、,.!?~～]+/g, "").toLowerCase();
  const recent = Array.isArray(recentReplies) ? recentReplies.map((item) => clean(item, MAX_REPLY_LENGTH).replace(/[\s，。！？、,.!?~～]+/g, "").toLowerCase()).filter(Boolean) : [];
  if (recent.some((item) => item === normalized || (normalized.length >= 10 && item.includes(normalized)))) {
    warnings.push("与最近发送过的内容重复度较高");
    suggestions.push("换一个切入点，加入对方刚刚提到的具体细节");
  }
  if (currentMessage && !/[！？。]$/.test(text) && text.length > 20) {
    suggestions.push("可以留一个轻松的回应口，让对方更容易接话");
  }
  if (!suggestions.length && warnings.length) suggestions.push("保留主播自己的语气，删掉让对方有压力的部分");
  return {
    level: warnings.length ? "review" : "clear",
    warnings: [...new Set(warnings)].slice(0, 6),
    suggestions: [...new Set(suggestions)].slice(0, 4),
  };
}

module.exports = { checkReplyDraft, MAX_REPLY_LENGTH };
