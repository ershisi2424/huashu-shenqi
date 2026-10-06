function normalize(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isCurrentGeneration(expected, current) {
  if (!expected || !current) return false;
  return Number(expected.token) === Number(current.token)
    && normalize(expected.brotherId) === normalize(current.brotherId)
    && normalize(expected.sourceMessageId) === normalize(current.sourceMessageId);
}

module.exports = { isCurrentGeneration };
