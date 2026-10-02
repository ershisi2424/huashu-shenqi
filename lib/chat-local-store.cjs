const CHAT_STORAGE_KEY = "hh_chat_v1";
const ACTIVE_BROTHER_SUFFIX = ":active";
const REPLY_DRAFT_PREFIX = "hh_reply_draft_v1";

function safeScope(value) {
  return typeof value === "string" ? value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) : "";
}

function chatStorageKey(scope = "") {
  const normalized = safeScope(scope);
  return !normalized || normalized === "guest" ? CHAT_STORAGE_KEY : `${CHAT_STORAGE_KEY}:${normalized}`;
}

function memoryEnabledKey(scope = "") {
  const normalized = safeScope(scope);
  return !normalized || normalized === "guest" ? "hh_memory_enabled" : `hh_memory_enabled:${normalized}`;
}

function replyDraftStorageKey(scope = "", brotherId = "") {
  const normalizedScope = safeScope(scope) || "guest";
  const normalizedBrotherId = safeScope(brotherId);
  return `${REPLY_DRAFT_PREFIX}:${normalizedScope}:${normalizedBrotherId || "unknown"}`;
}

function normalizeReplyDraft(value) {
  if (!value || typeof value !== "object") return null;
  const replies = Array.isArray(value.replies) ? value.replies.slice(0, 12).map((reply) => ({
    style: typeof reply?.style === "string" ? reply.style.trim().slice(0, 80) : "",
    text: typeof reply?.text === "string" ? reply.text.replace(/\u0000/g, "").trim().slice(0, 2000) : "",
    rationale: typeof reply?.rationale === "string" ? reply.rationale.replace(/\u0000/g, "").trim().slice(0, 500) : "",
  })).filter((reply) => reply.text) : [];
  if (!replies.length) return null;
  return {
    savedAt: typeof value.savedAt === "string" && !Number.isNaN(Date.parse(value.savedAt)) ? new Date(value.savedAt).toISOString() : new Date().toISOString(),
    replies,
    profile: value.profile && typeof value.profile === "object" ? value.profile : null,
    coreDecision: value.coreDecision && typeof value.coreDecision === "object" ? value.coreDecision : null,
    algorithmCore: value.algorithmCore && typeof value.algorithmCore === "object" ? value.algorithmCore : null,
    runtimeAnalysis: value.runtimeAnalysis && typeof value.runtimeAnalysis === "object" ? value.runtimeAnalysis : null,
    runtimeIntake: value.runtimeIntake && typeof value.runtimeIntake === "object" ? value.runtimeIntake : null,
    runtime: value.runtime && typeof value.runtime === "object" ? value.runtime : null,
    openingTopics: Array.isArray(value.openingTopics) ? value.openingTopics.slice(0, 8).filter((item) => typeof item === "string").map((item) => item.trim().slice(0, 240)).filter(Boolean) : [],
    liveInvite: value.liveInvite && typeof value.liveInvite === "object" ? value.liveInvite : null,
    replyStyle: typeof value.replyStyle === "string" ? value.replyStyle.trim().slice(0, 40) || "balanced" : "balanced",
  };
}

function readReplyDraft(storage, scope = "", brotherId = "") {
  if (!storage || typeof storage.getItem !== "function") return null;
  const raw = storage.getItem(replyDraftStorageKey(scope, brotherId));
  if (!raw) return null;
  try {
    return normalizeReplyDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeReplyDraft(storage, scope = "", brotherId = "", value = {}) {
  if (!storage || typeof storage.setItem !== "function") return false;
  const normalized = normalizeReplyDraft(value);
  if (!normalized) return false;
  storage.setItem(replyDraftStorageKey(scope, brotherId), JSON.stringify(normalized));
  return true;
}

function clearReplyDraft(storage, scope = "", brotherId = "") {
  if (!storage || typeof storage.removeItem !== "function") return false;
  storage.removeItem(replyDraftStorageKey(scope, brotherId));
  return true;
}

function activeBrotherStorageKey(scope = "") {
  return `${chatStorageKey(scope)}${ACTIVE_BROTHER_SUFFIX}`;
}

function readActiveBrotherId(storage, scope = "") {
  if (!storage || typeof storage.getItem !== "function") return null;
  const value = storage.getItem(activeBrotherStorageKey(scope));
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : null;
}

function writeActiveBrotherId(storage, scope = "", brotherId = "") {
  if (!storage || typeof storage.setItem !== "function") return false;
  const key = activeBrotherStorageKey(scope);
  const value = typeof brotherId === "string" ? brotherId.trim().slice(0, 120) : "";
  if (!value) {
    if (typeof storage.removeItem === "function") storage.removeItem(key);
    return false;
  }
  storage.setItem(key, value);
  return true;
}

function emptySnapshot() {
  return {
    version: 1,
    brothers: [],
    messages: [],
    activeBrotherId: null,
    replyStyle: "balanced",
    profileSources: { works: "", comments: "", statements: "" },
  };
}

function normalizeProfileSources(value) {
  const sources = value && typeof value === "object" ? value : {};
  return {
    works: typeof sources.works === "string" ? sources.works.replace(/\u0000/g, "").trim().slice(0, 6000) : "",
    comments: typeof sources.comments === "string" ? sources.comments.replace(/\u0000/g, "").trim().slice(0, 6000) : "",
    statements: typeof sources.statements === "string" ? sources.statements.replace(/\u0000/g, "").trim().slice(0, 6000) : "",
  };
}

function normalizeSnapshot(value) {
  if (!value || typeof value !== "object" || value.version !== 1 || !Array.isArray(value.brothers) || !Array.isArray(value.messages)) {
    throw new Error("INVALID_CHAT_SNAPSHOT");
  }
  return {
    version: 1,
    brothers: value.brothers.slice(0, 200),
    messages: value.messages.slice(0, 2000),
    activeBrotherId: typeof value.activeBrotherId === "string" ? value.activeBrotherId : null,
    replyStyle: typeof value.replyStyle === "string" ? value.replyStyle.trim().slice(0, 40) || "balanced" : "balanced",
    profileSources: normalizeProfileSources(value.profileSources),
  };
}

function readChatSnapshot(storage, memoryEnabled, key = CHAT_STORAGE_KEY) {
  if (!memoryEnabled) return emptySnapshot();
  const raw = storage.getItem(key);
  if (raw === null) return emptySnapshot();
  try {
    return normalizeSnapshot(JSON.parse(raw));
  } catch (error) {
    const wrapped = new Error("INVALID_CHAT_SNAPSHOT");
    wrapped.cause = error;
    throw wrapped;
  }
}

function writeChatSnapshot(storage, memoryEnabled, value, key = CHAT_STORAGE_KEY) {
  if (!memoryEnabled) return false;
  const snapshot = normalizeSnapshot({ ...emptySnapshot(), ...(value || {}) });
  storage.setItem(key, JSON.stringify(snapshot));
  return true;
}

function clearChatSnapshot(storage, key = CHAT_STORAGE_KEY) {
  storage.removeItem(key);
}

module.exports = {
  activeBrotherStorageKey,
  CHAT_STORAGE_KEY,
  chatStorageKey,
  clearChatSnapshot,
  emptySnapshot,
  memoryEnabledKey,
  clearReplyDraft,
  normalizeReplyDraft,
  readReplyDraft,
  replyDraftStorageKey,
  normalizeSnapshot,
  normalizeProfileSources,
  readActiveBrotherId,
  readChatSnapshot,
  writeActiveBrotherId,
  writeChatSnapshot,
  writeReplyDraft,
};
