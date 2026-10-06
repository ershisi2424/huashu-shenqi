function text(value) {
  return typeof value === "string" ? value : "";
}

export function estimateProfileRequest({
  currentMessage = "",
  works = "",
  comments = "",
  statements = "",
  history = [],
  replyCount = 8,
  relationshipState = {},
} = {}) {
  const normalizedReplyCount = Math.max(4, Math.min(8, Number.parseInt(replyCount, 10) || 8));
  const material = {
    currentMessage: text(currentMessage),
    works: text(works),
    comments: text(comments),
    statements: text(statements),
    history: Array.isArray(history) ? history : [],
    replyCount: normalizedReplyCount,
    relationshipState: relationshipState && typeof relationshipState === "object" ? relationshipState : {},
  };
  const serialized = JSON.stringify(material);
  const serializedChars = serialized.length;
  const sourceChars = [material.works, material.comments, material.statements].reduce((total, value) => total + value.length, 0);
  const approxInputTokens = Math.max(1, Math.ceil(serializedChars / 2));
  return {
    replyCount: material.replyCount,
    historyCount: material.history.length,
    sourceChars,
    serializedChars,
    approxInputTokens,
    sizeBand: serializedChars > 24000 ? "large" : serializedChars > 12000 ? "medium" : "normal",
  };
}
