const CHAT_STORAGE_KEY = "hh_chat_v1";
const ACTIVE_BROTHER_SUFFIX = ":active";
const REPLY_DRAFT_PREFIX = "hh_reply_draft_v1";
const REPLY_HISTORY_PREFIX = "hh_reply_history_v1";
const GUEST_ACTIVITY_PREFIX = "hh_guest_local_activity_v1";
const GUEST_LOCAL_TTL_MS = 24 * 60 * 60 * 1000;

function safeScope(value) {
  return typeof value === "string" ? value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) : "";
}

function guestScopeId(scope = "") {
  const normalized = safeScope(scope);
  return /^guest_[a-zA-Z0-9._-]+$/.test(normalized) ? normalized : "";
}

function guestStorageActivityKey(scope = "") {
  const id = guestScopeId(scope);
  return id ? `${GUEST_ACTIVITY_PREFIX}:${id}` : "";
}

function touchGuestStorage(storage, scope = "", now = Date.now()) {
  const key = guestStorageActivityKey(scope);
  const timestamp = Number(now);
  if (!key || !storage || typeof storage.setItem !== "function" || !Number.isFinite(timestamp)) return false;
  try {
    storage.setItem(key, JSON.stringify({ version: 1, lastUsedAt: timestamp }));
    return true;
  } catch {
    return false;
  }
}

function guestStorageNamespaceFromKey(key) {
  if (typeof key !== "string") return "";
  const prefixes = [
    `${GUEST_ACTIVITY_PREFIX}:`,
    "hh_chat_session_v1:",
    "hh_chat_v1:",
    "hh_memory_enabled:",
    `${REPLY_DRAFT_PREFIX}:`,
    `${REPLY_HISTORY_PREFIX}:`,
  ];
  for (const prefix of prefixes) {
    if (!key.startsWith(prefix)) continue;
    const match = key.slice(prefix.length).match(/^(guest_[a-zA-Z0-9._-]+)(?=:|$)/);
    if (match) return match[1];
  }
  return "";
}

function timestampValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function latestTimestamp(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") return timestampValue(value);
  if (Array.isArray(value)) {
    let latest = null;
    for (const item of value.slice(0, 2000)) {
      const candidate = latestTimestamp(item, depth + 1);
      if (candidate !== null && (latest === null || candidate > latest)) latest = candidate;
    }
    return latest;
  }
  if (typeof value !== "object") return null;
  let latest = null;
  for (const [key, item] of Object.entries(value).slice(0, 300)) {
    const candidate = ["savedAt", "lastUsedAt", "updatedAt", "createdAt", "timestamp", "lastSeenAt"].includes(key)
      ? timestampValue(item)
      : latestTimestamp(item, depth + 1);
    if (candidate !== null && (latest === null || candidate > latest)) latest = candidate;
  }
  return latest;
}

function readGuestActivity(storage, namespace) {
  const key = namespace ? `${GUEST_ACTIVITY_PREFIX}:${namespace}` : "";
  if (!key || !storage || typeof storage.getItem !== "function") return null;
  try {
    const value = JSON.parse(storage.getItem(key) || "null");
    return timestampValue(value?.lastUsedAt);
  } catch {
    return null;
  }
}

function sweepGuestStorage(storage, { now = Date.now(), ttlMs = GUEST_LOCAL_TTL_MS, preserveScope = "" } = {}) {
  if (!storage || typeof storage.length !== "number" || typeof storage.key !== "function" || typeof storage.removeItem !== "function") {
    return { scanned: 0, removed: 0, removedScopes: [] };
  }
  const timestamp = Number(now);
  const ttl = Number(ttlMs);
  if (!Number.isFinite(timestamp) || !Number.isFinite(ttl) || ttl <= 0) return { scanned: 0, removed: 0, removedScopes: [] };
  const preserve = guestScopeId(preserveScope);
  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (typeof key === "string") keys.push(key);
  }
  const namespaces = new Set(keys.map(guestStorageNamespaceFromKey).filter(Boolean));
  const removedScopes = [];
  let removed = 0;
  for (const namespace of namespaces) {
    if (namespace === preserve) continue;
    let lastUsedAt = readGuestActivity(storage, namespace);
    if (lastUsedAt === null) {
      for (const key of keys) {
        if (guestStorageNamespaceFromKey(key) !== namespace) continue;
        try {
          const parsed = JSON.parse(storage.getItem(key) || "null");
          const candidate = latestTimestamp(parsed);
          if (candidate !== null && (lastUsedAt === null || candidate > lastUsedAt)) lastUsedAt = candidate;
        } catch {
          // A malformed legacy value has no reliable activity time; preserve it.
        }
      }
    }
    if (lastUsedAt === null || timestamp - lastUsedAt < ttl) continue;
    let removedForScope = 0;
    for (const key of keys) {
      if (guestStorageNamespaceFromKey(key) !== namespace) continue;
      try {
        storage.removeItem(key);
        removed += 1;
        removedForScope += 1;
      } catch {
        // Storage can become unavailable while a tab is closing; continue safely.
      }
    }
    if (removedForScope) removedScopes.push(namespace);
  }
  return { scanned: namespaces.size, removed, removedScopes };
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
    sourceMessageId: typeof value.sourceMessageId === "string" ? value.sourceMessageId.trim().slice(0, 120) : "",
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
  touchGuestStorage(storage, scope);
  return true;
}

function clearReplyDraft(storage, scope = "", brotherId = "") {
  if (!storage || typeof storage.removeItem !== "function") return false;
  storage.removeItem(replyDraftStorageKey(scope, brotherId));
  return true;
}

function replyHistoryStorageKey(scope = "", brotherId = "") {
  const normalizedScope = safeScope(scope) || "guest";
  const normalizedBrotherId = safeScope(brotherId);
  return `${REPLY_HISTORY_PREFIX}:${normalizedScope}:${normalizedBrotherId || "unknown"}`;
}

function normalizeReplyHistory(value) {
  if (!value || typeof value !== "object") return null;
  const replies = Array.isArray(value.replies) ? value.replies.slice(0, 12).map((reply) => ({
    style: typeof reply?.style === "string" ? reply.style.trim().slice(0, 80) : "",
    text: typeof reply?.text === "string" ? reply.text.replace(/\u0000/g, "").trim().slice(0, 2000) : "",
    rationale: typeof reply?.rationale === "string" ? reply.rationale.replace(/\u0000/g, "").trim().slice(0, 500) : "",
  })).filter((reply) => reply.text) : [];
  if (!replies.length) return null;
  return {
    id: typeof value.id === "string" ? value.id.trim().slice(0, 160) : `guest_history_${Date.now().toString(36)}`,
    brotherId: typeof value.brotherId === "string" ? value.brotherId.trim().slice(0, 120) : "",
    sourceMessageId: typeof value.sourceMessageId === "string" ? value.sourceMessageId.trim().slice(0, 120) : "",
    currentMessage: typeof value.currentMessage === "string" ? value.currentMessage.replace(/\u0000/g, "").trim().slice(0, 2000) : "",
    replyStyle: typeof value.replyStyle === "string" ? value.replyStyle.trim().slice(0, 40) || "balanced" : "balanced",
    replies,
    profile: value.profile && typeof value.profile === "object" ? value.profile : null,
    coreDecision: value.coreDecision && typeof value.coreDecision === "object" ? value.coreDecision : null,
    algorithmCore: value.algorithmCore && typeof value.algorithmCore === "object" ? value.algorithmCore : null,
    runtimeAnalysis: value.runtimeAnalysis && typeof value.runtimeAnalysis === "object" ? value.runtimeAnalysis : null,
    runtimeIntake: value.runtimeIntake && typeof value.runtimeIntake === "object" ? value.runtimeIntake : null,
    runtime: value.runtime && typeof value.runtime === "object" ? value.runtime : null,
    openingTopics: Array.isArray(value.openingTopics) ? value.openingTopics.slice(0, 8).filter((item) => typeof item === "string").map((item) => item.trim().slice(0, 240)).filter(Boolean) : [],
    liveInvite: value.liveInvite && typeof value.liveInvite === "object" ? value.liveInvite : null,
    createdAt: typeof value.createdAt === "string" && !Number.isNaN(Date.parse(value.createdAt)) ? new Date(value.createdAt).toISOString() : new Date().toISOString(),
  };
}

function readReplyHistory(storage, scope = "", brotherId = "") {
  if (!storage || typeof storage.getItem !== "function") return [];
  const raw = storage.getItem(replyHistoryStorageKey(scope, brotherId));
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.slice(0, 30).map(normalizeReplyHistory).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeReplyHistory(storage, scope = "", brotherId = "", value = []) {
  if (!storage || typeof storage.setItem !== "function") return false;
  const items = Array.isArray(value) ? value.slice(0, 30).map(normalizeReplyHistory).filter(Boolean) : [];
  storage.setItem(replyHistoryStorageKey(scope, brotherId), JSON.stringify(items));
  touchGuestStorage(storage, scope);
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
  touchGuestStorage(storage, scope);
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
  const scope = key.startsWith(`${CHAT_STORAGE_KEY}:`) ? key.slice(`${CHAT_STORAGE_KEY}:`.length).replace(/:active$/, "") : "";
  touchGuestStorage(storage, scope);
  return true;
}

function clearChatSnapshot(storage, key = CHAT_STORAGE_KEY) {
  storage.removeItem(key);
}

module.exports = {
  activeBrotherStorageKey,
  CHAT_STORAGE_KEY,
  GUEST_ACTIVITY_PREFIX,
  GUEST_LOCAL_TTL_MS,
  chatStorageKey,
  clearChatSnapshot,
  emptySnapshot,
  memoryEnabledKey,
  guestStorageActivityKey,
  guestStorageNamespaceFromKey,
  sweepGuestStorage,
  touchGuestStorage,
  clearReplyDraft,
  normalizeReplyDraft,
  normalizeReplyHistory,
  readReplyDraft,
  readReplyHistory,
  replyHistoryStorageKey,
  replyDraftStorageKey,
  normalizeSnapshot,
  normalizeProfileSources,
  readActiveBrotherId,
  readChatSnapshot,
  writeActiveBrotherId,
  writeChatSnapshot,
  writeReplyDraft,
  writeReplyHistory,
};
