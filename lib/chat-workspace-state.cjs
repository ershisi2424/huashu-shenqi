function shouldHydrateWorkspace({ requestToken, currentToken, touched, currentDraft, currentReplies, currentProfile, currentSourceMessageId = "", item } = {}) {
  if (!item || requestToken !== currentToken || touched) return false;
  const sourceMessageId = typeof item.sourceMessageId === "string" ? item.sourceMessageId.trim() : "";
  const targetMessageId = typeof currentSourceMessageId === "string" ? currentSourceMessageId.trim() : "";
  if (item.replies?.length > 0 && (!targetMessageId || !sourceMessageId || sourceMessageId !== targetMessageId)) return false;
  if (typeof currentDraft === "string" && currentDraft.trim()) return false;
  if (Array.isArray(currentReplies) && currentReplies.length > 0) return false;
  if (currentProfile) return false;
  return true;
}

module.exports = { shouldHydrateWorkspace };
