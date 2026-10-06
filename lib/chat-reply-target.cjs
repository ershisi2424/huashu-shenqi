function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function pickReplyTarget(messages, selectedMessageId = "") {
  const confirmed = Array.isArray(messages)
    ? messages.filter((message) => message?.sender === "brother" && message?.status === "confirmed")
    : [];
  const selected = confirmed.find((message) => message.id === selectedMessageId);
  if (selected) return selected;
  return confirmed.reduce((latest, message) => {
    if (!latest) return message;
    return timestamp(message.createdAt) >= timestamp(latest.createdAt) ? message : latest;
  }, null);
}

module.exports = { pickReplyTarget };
