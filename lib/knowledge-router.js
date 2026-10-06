const KNOWLEDGE_SNIPPETS = {
  gift: "【礼物与金钱】平静感谢具体心意，不夸张兴奋、不暗示继续送、不把感情与消费绑定。遇到转账、借钱或贵重礼物，先说明边界和量力而行，不以亲密承诺交换。",
  distress: "【负面情绪】先倾听和回应具体感受，再决定是否追问；避免空泛鸡汤和永久陪伴承诺。涉及自伤或威胁时，建议联系现实中的可信任者或专业帮助。",
  invitation: "【邀约】只回应当下提出的具体安排，不制造暧昧承诺；信息不足时先澄清时间、地点和边界，主播可以明确说暂时不方便。",
  conflict: "【冲突】先复述可确认事实和感受，不争输赢、不贴标签；只处理当前一件事，对方拒绝继续时停止解释和追问。",
  privacy: "【隐私与越界】不索要或交换私照、住址、联系方式等敏感信息；遇到色情、威胁或曝光隐私请求，简短设限、停止推进，必要时寻求平台或现实帮助。",
};

export function routeKnowledge(state = {}, currentMessage = "") {
  const text = typeof currentMessage === "string" ? currentMessage : "";
  const riskTypes = Array.isArray(state?.risk?.types) ? state.risk.types : [];
  const topics = [];
  if (riskTypes.includes("money") || /礼物|嘉年华|红包|转账|打钱|借钱|刷/.test(text)) topics.push("gift");
  if (riskTypes.includes("sexual_or_privacy") || /私照|裸聊|约炮|开房|住址|手机号|联系方式|曝光/.test(text)) topics.push("privacy");
  if (riskTypes.includes("self_harm") || riskTypes.includes("threat") || Number(state?.emotion?.intensity) >= 5 || /吵架|冲突|被骂|不想干|绝望|威胁/.test(text)) topics.push("distress");
  if (/周末|有空|出来|见面|想见|一起吃|约你/.test(text)) topics.push("invitation");
  if (/生气|误会|不理|拉黑|删掉|怎么回事|为什么/.test(text)) topics.push("conflict");
  const uniqueTopics = [...new Set(topics)].slice(0, 3);
  return {
    topics: uniqueTopics,
    text: uniqueTopics.map(topic => KNOWLEDGE_SNIPPETS[topic]).join("\n") || "当前消息未命中特定主题，遵循通用真诚、具体、有边界原则。",
  };
}
