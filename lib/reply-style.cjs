const REPLY_STYLES = ["balanced", "warm", "humorous", "mature", "brief", "direct"];

const STYLE_INSTRUCTIONS = {
  balanced: "保持自然、真诚、有分寸的日常聊天语气，不刻意撒娇，也不把礼物当成义务。",
  warm: "语气温暖细腻，先回应对方的情绪，再自然接一个轻问题，避免过度依赖和夸张承诺。",
  humorous: "加入轻松克制的幽默或画面感，但不要拿对方的困难开玩笑，不使用油腻套路。",
  mature: "语气稳重像熟悉的朋友，体现尊重和边界，少用夸张形容词，多回应具体事实。",
  brief: "控制在一到两句，保留核心关心和一个自然接话点，不堆砌客套话。",
  direct: "表达清楚直接，少绕弯子，保持礼貌和温度，不催促、不暗示对方必须付出。",
};

function normalizeReplyStyle(value) {
  const style = typeof value === "string" ? value.trim().toLowerCase() : "";
  return REPLY_STYLES.includes(style) ? style : "balanced";
}

function replyStyleInstruction(value) {
  return STYLE_INSTRUCTIONS[normalizeReplyStyle(value)];
}

module.exports = { REPLY_STYLES, STYLE_INSTRUCTIONS, normalizeReplyStyle, replyStyleInstruction };
