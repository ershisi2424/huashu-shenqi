function normalizeScope(value) {
  if (!value || typeof value !== "object") return null;
  const brotherId = typeof value.brotherId === "string" ? value.brotherId.trim() : "";
  const messageId = typeof value.messageId === "string" ? value.messageId.trim() : "";
  if (!brotherId && !messageId) return null;
  return { brotherId, messageId };
}

function isCurrentError(scope, activeBrotherId, latestMessageId) {
  const normalized = normalizeScope(scope);
  if (!normalized) return true;
  if (normalized.brotherId && normalized.brotherId !== String(activeBrotherId || "")) return false;
  if (normalized.messageId && normalized.messageId !== String(latestMessageId || "")) return false;
  return true;
}

module.exports = { isCurrentError, normalizeScope };
