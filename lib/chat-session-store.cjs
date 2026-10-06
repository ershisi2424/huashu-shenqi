const { emptySnapshot, normalizeSnapshot, touchGuestStorage } = require("./chat-local-store.cjs");

const CHAT_SESSION_STORAGE_KEY = "hh_chat_session_v1";

function safeScope(value) {
  return typeof value === "string" ? value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) : "";
}

function chatSessionStorageKey(scope = "") {
  const normalized = safeScope(scope) || "guest";
  return `${CHAT_SESSION_STORAGE_KEY}:${normalized}`;
}

function readChatSessionSnapshot(storage, scope = "") {
  if (!storage || typeof storage.getItem !== "function") return emptySnapshot();
  const raw = storage.getItem(chatSessionStorageKey(scope));
  if (raw === null) return emptySnapshot();
  try {
    return normalizeSnapshot(JSON.parse(raw));
  } catch {
    // 会话暂存损坏时只丢弃这一份暂存，不能阻断聊天页启动。
    return emptySnapshot();
  }
}

function writeChatSessionSnapshot(storage, scope = "", value = {}) {
  if (!storage || typeof storage.setItem !== "function") return false;
  const snapshot = normalizeSnapshot({ ...emptySnapshot(), ...(value || {}) });
  storage.setItem(chatSessionStorageKey(scope), JSON.stringify(snapshot));
  touchGuestStorage(storage, scope);
  return true;
}

function clearChatSessionSnapshot(storage, scope = "") {
  if (!storage || typeof storage.removeItem !== "function") return false;
  storage.removeItem(chatSessionStorageKey(scope));
  return true;
}

module.exports = {
  CHAT_SESSION_STORAGE_KEY,
  chatSessionStorageKey,
  clearChatSessionSnapshot,
  readChatSessionSnapshot,
  writeChatSessionSnapshot,
};
