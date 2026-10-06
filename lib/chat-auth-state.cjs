const AUTH_SCOPE_STORAGE_KEY = "hh_chat_last_auth_scope_v1";
const AUTH_SCOPE_LOGOUT_KEY = "hh_chat_auth_explicit_logout_v1";

function isUserScope(value) {
  return typeof value === "string" && /^user:[a-zA-Z0-9._-]+$/.test(value);
}

function readLastAuthScope(storage) {
  if (!storage || typeof storage.getItem !== "function") return "";
  const value = storage.getItem(AUTH_SCOPE_STORAGE_KEY);
  return isUserScope(value) ? value : "";
}

function inferLegacyAuthScope(storage) {
  if (!storage || typeof storage.length !== "number" || typeof storage.key !== "function") return "";
  const scopes = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    const match = typeof key === "string" && key.match(/^hh_chat_session_v1:(user_[a-zA-Z0-9._-]+)$/);
    if (match) {
      const scope = `user:${match[1].slice("user_".length)}`;
      if (isUserScope(scope) && !scopes.includes(scope)) scopes.push(scope);
    }
  }
  return scopes.length === 1 ? scopes[0] : "";
}

function writeLastAuthScope(storage, scope) {
  if (!storage || typeof storage.setItem !== "function" || !isUserScope(scope)) return false;
  storage.setItem(AUTH_SCOPE_STORAGE_KEY, scope);
  if (typeof storage.removeItem === "function") storage.removeItem(AUTH_SCOPE_LOGOUT_KEY);
  return true;
}

function clearLastAuthScope(storage) {
  if (!storage || typeof storage.removeItem !== "function") return false;
  storage.removeItem(AUTH_SCOPE_STORAGE_KEY);
  if (typeof storage.setItem === "function") storage.setItem(AUTH_SCOPE_LOGOUT_KEY, "true");
  return true;
}

function resolveUnauthenticatedState(storage) {
  if (storage?.getItem?.(AUTH_SCOPE_LOGOUT_KEY) === "true") return { scope: "guest", status: "guest" };
  const scope = readLastAuthScope(storage) || inferLegacyAuthScope(storage);
  return scope ? { scope, status: "expired" } : { scope: "guest", status: "guest" };
}

module.exports = {
  AUTH_SCOPE_STORAGE_KEY,
  AUTH_SCOPE_LOGOUT_KEY,
  clearLastAuthScope,
  inferLegacyAuthScope,
  readLastAuthScope,
  resolveUnauthenticatedState,
  writeLastAuthScope,
};
