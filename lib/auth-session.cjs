const path = require("node:path");
const crypto = require("node:crypto");
const { createAuthStore, normalizePhone } = require("./auth-store.cjs");

let store = null;
let storeFilename = null;

function getAuthStore(options = {}) {
  const filename = options.filename || process.env.AUTH_DB_PATH || path.join(process.cwd(), "data", "auth.sqlite");
  if (store && storeFilename !== filename) {
    store.close();
    store = null;
  }
  if (!store) {
    store = createAuthStore({ filename });
    storeFilename = filename;
  }
  return store;
}

function authRequired() {
  if (process.env.AUTH_REQUIRED === "true") return true;
  if (process.env.AUTH_REQUIRED === "false") return false;
  return process.env.NODE_ENV === "production";
}

function requestAddress(req) {
  if (process.env.TRUST_PROXY === "true") {
    const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded;
  }
  return String(req?.socket?.remoteAddress || req?.connection?.remoteAddress || "unknown").trim() || "unknown";
}

function rateLimitBucketKey(scope, value) {
  return crypto.createHash("sha256").update(`${scope}\u0000${String(value || "unknown")}`).digest("hex");
}

function enforceAuthRateLimit(req, { scope, phone = "", maxRequests, windowMs, envPrefix } = {}) {
  const store = getAuthStore();
  const limit = Math.max(1, Number.parseInt(process.env[`${envPrefix}_MAX`], 10) || Number(maxRequests) || 10);
  const window = Math.max(1000, Number.parseInt(process.env[`${envPrefix}_WINDOW_MS`], 10) || Number(windowMs) || 15 * 60 * 1000);
  const values = [`ip:${requestAddress(req)}`];
  const account = normalizePhone(phone);
  if (account) values.push(`account:${account}`);
  let blocked = null;
  for (const value of values) {
    const result = store.consumeRateLimit({ scope, bucketKey: rateLimitBucketKey(scope, value), maxRequests: limit, windowMs: window });
    if (!result.allowed && (!blocked || result.retryAfterSeconds > blocked.retryAfterSeconds)) blocked = result;
  }
  return blocked ? { allowed: false, retryAfterSeconds: blocked.retryAfterSeconds } : { allowed: true, retryAfterSeconds: 0 };
}

function rejectAuthRateLimit(req, res, options = {}) {
  const result = enforceAuthRateLimit(req, options);
  if (result.allowed) return false;
  const retryAfter = Math.max(1, Number(result.retryAfterSeconds) || 1);
  res.setHeader("Retry-After", String(retryAfter));
  res.status(429).json({ error: "认证请求过于频繁，请稍后重试", code: "AUTH_RATE_LIMIT" });
  return true;
}

function setPrivateNoStore(res) {
  if (!res || typeof res.setHeader !== "function") return;
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
}

function readSessionToken(req) {
  const cookie = String(req?.headers?.cookie || "");
  const match = cookie.match(/(?:^|;\s*)hh_session=([^;]+)/);
  if (!match) return "";
  try { return decodeURIComponent(match[1]); } catch { return ""; }
}

function readGuestSessionToken(req) {
  const cookie = String(req?.headers?.cookie || "");
  const match = cookie.match(/(?:^|;\s*)hh_guest_session=([^;]+)/);
  if (!match) return "";
  try { return decodeURIComponent(match[1]); } catch { return ""; }
}

function getCurrentUser(req) {
  return getAuthStore().getSessionUser(readSessionToken(req));
}

function getCurrentGuest(req) {
  return getAuthStore().getGuestSession(readGuestSessionToken(req));
}

function requireUser(req, res, roles = []) {
  setPrivateNoStore(res);
  const user = getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "请先登录", code: "AUTH_REQUIRED" });
    return null;
  }
  if (roles.length && !roles.includes(user.role)) {
    res.status(403).json({ error: "当前账号没有执行此操作的权限", code: "FORBIDDEN" });
    return null;
  }
  return user;
}

function requireGuest(req, res) {
  setPrivateNoStore(res);
  const store = getAuthStore();
  // Every guest-only business request is a cleanup/touch boundary. Keeping
  // this in the shared guard prevents future guest APIs from skipping the
  // 24-hour cleanup or serving a stale cookie lifetime.
  store.cleanupGuestData();
  const token = readGuestSessionToken(req);
  const guest = token ? store.touchGuestSession(token) : null;
  if (!guest) {
    clearGuestSessionCookie(res);
    res.status(401).json({ error: "游客会话已失效", code: "GUEST_AUTH_REQUIRED" });
    return null;
  }
  setGuestSessionCookie(res, token, guest.expiresAt);
  return guest;
}

function sessionCookie(token, maxAgeSeconds) {
  const secure = process.env.AUTH_COOKIE_SECURE === "true" ? "; Secure" : "";
  return `hh_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}${secure}`;
}

function guestSessionCookie(token, maxAgeSeconds) {
  const secure = process.env.AUTH_COOKIE_SECURE === "true" ? "; Secure" : "";
  return `hh_guest_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}${secure}`;
}

function appendSetCookie(res, cookie) {
  const existing = typeof res?.getHeader === "function" ? res.getHeader("Set-Cookie") : null;
  if (!existing) return res.setHeader("Set-Cookie", cookie);
  const values = Array.isArray(existing) ? existing : [existing];
  res.setHeader("Set-Cookie", [...values, cookie]);
}

function setSessionCookie(res, token, expiresAt) {
  appendSetCookie(res, sessionCookie(token, Math.max(0, (expiresAt - Date.now()) / 1000)));
}

function clearSessionCookie(res) {
  appendSetCookie(res, sessionCookie("", 0));
}

function setGuestSessionCookie(res, token, expiresAt) {
  appendSetCookie(res, guestSessionCookie(token, Math.max(0, (expiresAt - Date.now()) / 1000)));
}

function clearGuestSessionCookie(res) {
  appendSetCookie(res, guestSessionCookie("", 0));
}

module.exports = {
  getAuthStore,
  authRequired,
  enforceAuthRateLimit,
  rejectAuthRateLimit,
  setPrivateNoStore,
  readSessionToken,
  readGuestSessionToken,
  getCurrentUser,
  getCurrentGuest,
  requireUser,
  requireGuest,
  setSessionCookie,
  clearSessionCookie,
  setGuestSessionCookie,
  clearGuestSessionCookie,
};
