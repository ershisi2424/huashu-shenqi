const SENDER_DIRECTIONS = {
  brother: "left",
  anchor: "right",
};

const SOURCES = new Set(["manual", "paste", "screenshot_ocr", "ai_draft", "system"]);
const STATUSES = new Set(["draft", "pending_confirmation", "confirmed", "sent", "discarded"]);

function cleanText(value, maxLength = 2000) {
  if (typeof value !== "string") return "";
  return value.replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function iso(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date().toISOString();
}

function createBrother(input = {}, id = input.id || makeId("bro")) {
  const nickname = cleanText(input.nickname, 80);
  if (!nickname) throw new Error("BROTHER_NICKNAME_REQUIRED");
  const now = iso(input.createdAt);
  return {
    id: cleanText(id, 120),
    nickname,
    note: cleanText(input.note, 240),
    address: cleanText(input.address, 40),
    profile: input.profile && typeof input.profile === "object" ? input.profile : null,
    createdAt: now,
    updatedAt: iso(input.updatedAt || now),
  };
}

function compareDescending(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  return b > a ? 1 : b < a ? -1 : 0;
}

function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortChatBrothers(items) {
  if (!Array.isArray(items)) return [];
  return items.slice().sort((left, right) => {
    const updated = timestamp(right.updatedAt) - timestamp(left.updatedAt);
    if (updated) return updated;
    const created = timestamp(right.createdAt) - timestamp(left.createdAt);
    if (created) return created;
    const clientId = compareDescending(left.clientId, right.clientId);
    if (clientId) return clientId;
    return compareDescending(left.id, right.id);
  });
}

function defaultStatus(sender, source, requestedStatus) {
  if (requestedStatus) return requestedStatus;
  if (source === "ai_draft") return "draft";
  if (sender === "brother") return "confirmed";
  return "draft";
}

function normalizeMessage(input = {}) {
  const sender = input.sender;
  if (!Object.hasOwn(SENDER_DIRECTIONS, sender)) throw new Error("INVALID_MESSAGE_SENDER");
  const text = cleanText(input.text);
  if (!text) throw new Error("MESSAGE_TEXT_REQUIRED");
  const source = input.source || (sender === "brother" ? "manual" : "ai_draft");
  if (!SOURCES.has(source)) throw new Error("INVALID_MESSAGE_SOURCE");
  const status = defaultStatus(sender, source, input.status);
  if (!STATUSES.has(status)) throw new Error("INVALID_MESSAGE_STATUS");
  if (status === "sent" && sender !== "anchor") throw new Error("ONLY_ANCHOR_CAN_BE_SENT");
  const createdAt = iso(input.createdAt);
  return {
    id: cleanText(input.id, 120) || makeId("msg"),
    conversationId: cleanText(input.conversationId, 120),
    brotherId: cleanText(input.brotherId, 120),
    sender,
    direction: SENDER_DIRECTIONS[sender],
    source,
    status,
    text,
    createdAt,
    updatedAt: iso(input.updatedAt || createdAt),
    confirmedAt: input.confirmedAt ? iso(input.confirmedAt) : (status === "confirmed" ? createdAt : null),
    sentAt: input.sentAt ? iso(input.sentAt) : (status === "sent" ? createdAt : null),
    policyWarnings: Array.isArray(input.policyWarnings) ? input.policyWarnings.slice(0, 8).map((item) => cleanText(item, 160)).filter(Boolean) : [],
  };
}

function createMessage(input = {}) {
  return normalizeMessage(input);
}

function addMessage(messages, message) {
  if (!Array.isArray(messages)) throw new Error("MESSAGES_MUST_BE_ARRAY");
  const normalized = normalizeMessage(message);
  if (messages.some((item) => item && item.id === normalized.id)) throw new Error("DUPLICATE_MESSAGE_ID");
  return [...messages, normalized].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

function editMessageText(messages, messageId, text) {
  if (!Array.isArray(messages)) throw new Error("MESSAGES_MUST_BE_ARRAY");
  const id = cleanText(messageId, 120);
  const target = messages.find((item) => item && item.id === id);
  if (!target) throw new Error("MESSAGE_NOT_FOUND");
  const nextText = cleanText(text);
  if (!nextText) throw new Error("MESSAGE_TEXT_REQUIRED");
  const previousTime = Date.parse(target.updatedAt || target.createdAt) || 0;
  const updatedAt = new Date(Math.max(Date.now(), previousTime + 1)).toISOString();
  const updated = normalizeMessage({ ...target, text: nextText, updatedAt });
  return messages.map((item) => item && item.id === id ? updated : item)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

function removeMessage(messages, messageId) {
  if (!Array.isArray(messages)) throw new Error("MESSAGES_MUST_BE_ARRAY");
  const id = cleanText(messageId, 120);
  return messages.filter((item) => !item || item.id !== id);
}

function markSent(message, sentAt = new Date().toISOString()) {
  const normalized = normalizeMessage(message);
  if (normalized.sender !== "anchor") throw new Error("ONLY_ANCHOR_CAN_BE_SENT");
  if (!["draft", "confirmed"].includes(normalized.status)) throw new Error("MESSAGE_NOT_SENDABLE");
  const timestamp = iso(sentAt);
  return {
    ...normalized,
    status: "sent",
    updatedAt: timestamp,
    sentAt: timestamp,
  };
}

function createConversation(input = {}, id = input.id || makeId("conversation")) {
  const brotherId = cleanText(input.brotherId, 120);
  const anchorId = cleanText(input.anchorId, 120);
  if (!brotherId || !anchorId) throw new Error("CONVERSATION_PARTICIPANTS_REQUIRED");
  const now = iso(input.createdAt);
  return {
    id: cleanText(id, 120),
    brotherId,
    anchorId,
    status: input.status === "archived" ? "archived" : "active",
    createdAt: now,
    updatedAt: iso(input.updatedAt || now),
  };
}

module.exports = {
  SENDER_DIRECTIONS,
  SOURCES,
  STATUSES,
  addMessage,
  createBrother,
  createConversation,
  createMessage,
  editMessageText,
  markSent,
  normalizeMessage,
  removeMessage,
  sortChatBrothers,
};
