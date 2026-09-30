const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const ROLES = new Set(["super_admin", "operator", "anchor"]);
const STATUSES = new Set(["pending", "active", "disabled"]);
const AUDIT_ACTIONS = new Set([
  "bootstrap.admin.create",
  "operator.register",
  "operator.approve",
  "operator.reject",
  "anchor.apply",
  "anchor.create",
  "anchor.approve",
  "anchor.reject",
  "auth.login",
  "chat.brother.create",
  "chat.message.append",
]);
const AUDIT_SENSITIVE_KEY = /password|token|secret|key|cookie/i;

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value, maxLength = 160) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, maxLength) : "";
}

function normalizePhone(value) {
  return cleanText(value, 32).replace(/[\s()-]/g, "");
}

function maskPhone(value) {
  const phone = normalizePhone(value);
  if (phone.length <= 4) return "****";
  if (phone.length <= 7) return `${phone.slice(0, 2)}****${phone.slice(-1)}`;
  return `${phone.slice(0, 3)}****${phone.slice(-2)}`;
}

function assertPhone(value) {
  const phone = normalizePhone(value);
  if (!/^\+?[0-9]{6,20}$/.test(phone)) throw new Error("INVALID_PHONE");
  return phone;
}

function assertPassword(value) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) throw new Error("INVALID_PASSWORD");
  return value;
}

function hashPassword(password) {
  const value = assertPassword(password);
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(value, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

function verifyPassword(password, encoded) {
  if (typeof password !== "string" || typeof encoded !== "string") return false;
  const [, saltText, hashText] = encoded.split("$");
  if (!saltText || !hashText) return false;
  try {
    const expected = Buffer.from(hashText, "base64url");
    const actual = crypto.scryptSync(password, Buffer.from(saltText, "base64url"), expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function encodeAuditCursor(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeAuditCursor(value) {
  if (!value) return null;
  if (typeof value !== "string" || value.length > 512) throw new Error("AUDIT_QUERY_INVALID");
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed.createdAt !== "string" || typeof parsed.id !== "string" || !parsed.id || Number.isNaN(Date.parse(parsed.createdAt))) {
      throw new Error("AUDIT_QUERY_INVALID");
    }
    return { createdAt: new Date(parsed.createdAt).toISOString(), id: parsed.id };
  } catch (error) {
    if (error?.message === "AUDIT_QUERY_INVALID") throw error;
    throw new Error("AUDIT_QUERY_INVALID");
  }
}

function sanitizeAuditValue(value, key = "", depth = 0) {
  if (AUDIT_SENSITIVE_KEY.test(key)) return undefined;
  if (depth > 6) return undefined;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeAuditValue(item, "", depth + 1)).filter((item) => item !== undefined);
  if (value && typeof value === "object") {
    const output = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      const safeValue = sanitizeAuditValue(childValue, childKey, depth + 1);
      if (safeValue !== undefined) output[childKey] = safeValue;
    }
    return output;
  }
  if (typeof value === "string") return value.slice(0, 500);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  return undefined;
}

function parseAuditMetadata(value) {
  let parsed = {};
  try {
    const candidate = JSON.parse(value || "{}");
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) parsed = candidate;
  } catch {
    parsed = {};
  }
  return sanitizeAuditValue(parsed) || {};
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    role: row.role,
    status: row.status,
    operatorId: row.operator_id || null,
    createdAt: row.created_at,
    approvedBy: row.approved_by || null,
    approvedAt: row.approved_at || null,
  };
}

function createAuthStore({ filename = process.env.AUTH_DB_PATH || path.join(process.cwd(), "data", "auth.sqlite") } = {}) {
  if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('super_admin', 'operator', 'anchor')),
      status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'disabled')),
      operator_id TEXT,
      created_at TEXT NOT NULL,
      approved_by TEXT,
      approved_at TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (operator_id) REFERENCES users(id),
      FOREIGN KEY (approved_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_users_operator ON users(operator_id);
    CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT,
      action TEXT NOT NULL,
      target_user_id TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (actor_user_id) REFERENCES users(id),
      FOREIGN KEY (target_user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_user_id);
    CREATE TABLE IF NOT EXISTS chat_brothers (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      operator_id TEXT,
      nickname TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      profile_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (owner_user_id, client_id),
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_brothers_operator ON chat_brothers(operator_id);
    CREATE INDEX IF NOT EXISTS idx_chat_brothers_owner ON chat_brothers(owner_user_id);
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      brother_id TEXT NOT NULL,
      actor_user_id TEXT NOT NULL,
      sender TEXT NOT NULL CHECK (sender IN ('brother', 'anchor')),
      direction TEXT NOT NULL CHECK (direction IN ('left', 'right')),
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      text TEXT NOT NULL,
      policy_warnings TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      confirmed_at TEXT,
      sent_at TEXT,
      FOREIGN KEY (brother_id) REFERENCES chat_brothers(id) ON DELETE CASCADE,
      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_brother_time ON chat_messages(brother_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_actor_time ON chat_messages(actor_user_id, created_at);
  `);

  const getUserById = db.prepare("SELECT * FROM users WHERE id = ?");
  const getUserByPhone = db.prepare("SELECT * FROM users WHERE phone = ?");
  const insertUser = db.prepare(`INSERT INTO users (id, phone, name, password_hash, role, status, operator_id, created_at, approved_by, approved_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertAudit = db.prepare("INSERT INTO audit_logs (id, actor_user_id, action, target_user_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)");

  function audit({ actorUserId = null, action, targetUserId = null, metadata = {} }) {
    insertAudit.run(crypto.randomUUID(), actorUserId, cleanText(action, 80), targetUserId, JSON.stringify(metadata).slice(0, 2000), nowIso());
  }

  function getUser(id) {
    return mapUser(getUserById.get(id));
  }

  function findByPhone(phone) {
    return getUserByPhone.get(normalizePhone(phone));
  }

  function ensureBootstrapAdmin({ phone, name = "最高权限", password }) {
    const normalizedPhone = assertPhone(phone);
    const existing = findByPhone(normalizedPhone);
    if (existing) return mapUser(existing);
    const timestamp = nowIso();
    const id = crypto.randomUUID();
    insertUser.run(id, normalizedPhone, cleanText(name, 80) || "最高权限", hashPassword(password), "super_admin", "active", null, timestamp, null, null, timestamp);
    audit({ action: "bootstrap.admin.create", targetUserId: id, metadata: { role: "super_admin" } });
    return getUser(id);
  }

  function registerOperator({ phone, name, password }) {
    const normalizedPhone = assertPhone(phone);
    const displayName = cleanText(name, 80);
    if (!displayName) throw new Error("NAME_REQUIRED");
    if (findByPhone(normalizedPhone)) throw new Error("PHONE_ALREADY_REGISTERED");
    const timestamp = nowIso();
    const id = crypto.randomUUID();
    insertUser.run(id, normalizedPhone, displayName, hashPassword(password), "operator", "pending", null, timestamp, null, null, timestamp);
    audit({ action: "operator.register", targetUserId: id, metadata: { role: "operator" } });
    return getUser(id);
  }

  function registerAnchorApplication({ operatorId, phone, name, password }) {
    const operator = getUserById.get(cleanText(operatorId, 120));
    if (!operator || operator.role !== "operator" || operator.status !== "active") throw new Error("OPERATOR_NOT_AVAILABLE");
    const normalizedPhone = assertPhone(phone);
    const displayName = cleanText(name, 80);
    if (!displayName) throw new Error("NAME_REQUIRED");
    if (findByPhone(normalizedPhone)) throw new Error("PHONE_ALREADY_REGISTERED");
    const timestamp = nowIso();
    const id = crypto.randomUUID();
    insertUser.run(id, normalizedPhone, displayName, hashPassword(password), "anchor", "pending", operator.id, timestamp, null, null, timestamp);
    audit({ action: "anchor.apply", targetUserId: id, metadata: { role: "anchor", operatorId: operator.id } });
    return getUser(id);
  }

  function approveOperator({ operatorId, approvedBy }) {
    const operator = getUserById.get(operatorId);
    const approver = getUserById.get(approvedBy);
    if (!operator || operator.role !== "operator" || operator.status !== "pending") throw new Error("OPERATOR_NOT_PENDING");
    if (!approver || approver.role !== "super_admin" || approver.status !== "active") throw new Error("SUPER_ADMIN_REQUIRED");
    const timestamp = nowIso();
    db.prepare("UPDATE users SET status = 'active', approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?").run(approvedBy, timestamp, timestamp, operatorId);
    audit({ actorUserId: approvedBy, action: "operator.approve", targetUserId: operatorId, metadata: { role: "operator" } });
    return getUser(operatorId);
  }

  function rejectOperator({ operatorId, approvedBy }) {
    const operator = getUserById.get(operatorId);
    const approver = getUserById.get(approvedBy);
    if (!operator || operator.role !== "operator" || operator.status !== "pending") throw new Error("OPERATOR_NOT_PENDING");
    if (!approver || approver.role !== "super_admin" || approver.status !== "active") throw new Error("SUPER_ADMIN_REQUIRED");
    const timestamp = nowIso();
    db.prepare("UPDATE users SET status = 'disabled', approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?").run(approvedBy, timestamp, timestamp, operatorId);
    audit({ actorUserId: approvedBy, action: "operator.reject", targetUserId: operatorId, metadata: { role: "operator" } });
    return getUser(operatorId);
  }

  function createAnchor({ operatorId, phone, name, password }) {
    const operator = getUserById.get(operatorId);
    if (!operator || operator.role !== "operator" || operator.status !== "active") throw new Error("ACTIVE_OPERATOR_REQUIRED");
    const normalizedPhone = assertPhone(phone);
    const displayName = cleanText(name, 80);
    if (!displayName) throw new Error("NAME_REQUIRED");
    if (findByPhone(normalizedPhone)) throw new Error("PHONE_ALREADY_REGISTERED");
    const timestamp = nowIso();
    const id = crypto.randomUUID();
    insertUser.run(id, normalizedPhone, displayName, hashPassword(password), "anchor", "active", operatorId, timestamp, operatorId, timestamp, timestamp);
    audit({ actorUserId: operatorId, action: "anchor.create", targetUserId: id, metadata: { role: "anchor", operatorId } });
    return getUser(id);
  }

  function authenticate(phone, password) {
    const row = findByPhone(phone);
    if (!row || row.status !== "active" || !verifyPassword(password, row.password_hash)) return null;
    return mapUser(row);
  }

  function getAccountState(phone) {
    const row = findByPhone(phone);
    return row ? { exists: true, status: row.status, role: row.role } : { exists: false, status: null, role: null };
  }

  function createSession({ userId, ttlMs = Number.parseInt(process.env.AUTH_SESSION_TTL_MS, 10) || 8 * 60 * 60 * 1000 }) {
    const user = getUserById.get(userId);
    if (!user || user.status !== "active") throw new Error("ACTIVE_USER_REQUIRED");
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + Math.max(60_000, Math.min(ttlMs, 30 * 24 * 60 * 60 * 1000));
    db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(hashToken(token), userId, expiresAt, nowIso());
    audit({ actorUserId: userId, action: "auth.login", targetUserId: userId, metadata: { role: user.role } });
    return { token, expiresAt };
  }

  function getSessionUser(token) {
    if (typeof token !== "string" || !token) return null;
    const row = db.prepare("SELECT s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?").get(hashToken(token));
    if (!row || Number(row.expires_at) <= Date.now() || row.status !== "active") {
      if (row) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
      return null;
    }
    return mapUser(row);
  }

  function revokeSession(token) {
    if (typeof token !== "string" || !token) return;
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  }

  function listPendingOperators() {
    return db.prepare("SELECT * FROM users WHERE role = 'operator' AND status = 'pending' ORDER BY created_at ASC").all().map(mapUser);
  }

  function listActiveOperators() {
    return db.prepare("SELECT id, phone, name, role, status, created_at FROM users WHERE role = 'operator' AND status = 'active' ORDER BY name COLLATE NOCASE ASC, created_at ASC").all().map((row) => ({
      id: row.id,
      name: row.name,
      phone: maskPhone(row.phone),
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  function listPendingAnchorsForOperator(operatorId) {
    const operator = getUserById.get(cleanText(operatorId, 120));
    if (!operator || operator.role !== "operator" || operator.status !== "active") throw new Error("ACTIVE_OPERATOR_REQUIRED");
    return db.prepare("SELECT * FROM users WHERE role = 'anchor' AND status = 'pending' AND operator_id = ? ORDER BY created_at ASC").all(operator.id).map(mapUser);
  }

  function changeAnchorStatus({ anchorId, approvedBy, status }) {
    const anchor = getUserById.get(cleanText(anchorId, 120));
    const approver = getUserById.get(cleanText(approvedBy, 120));
    if (!anchor || anchor.role !== "anchor" || anchor.status !== "pending") throw new Error("ANCHOR_NOT_PENDING");
    if (!approver || approver.role !== "operator" || approver.status !== "active" || anchor.operator_id !== approver.id) throw new Error("ANCHOR_APPROVAL_FORBIDDEN");
    const timestamp = nowIso();
    db.prepare("UPDATE users SET status = ?, approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?").run(status, approver.id, timestamp, timestamp, anchor.id);
    audit({ actorUserId: approver.id, action: status === "active" ? "anchor.approve" : "anchor.reject", targetUserId: anchor.id, metadata: { role: "anchor", operatorId: approver.id } });
    return getUser(anchor.id);
  }

  function approveAnchor({ anchorId, approvedBy }) {
    return changeAnchorStatus({ anchorId, approvedBy, status: "active" });
  }

  function rejectAnchor({ anchorId, approvedBy }) {
    return changeAnchorStatus({ anchorId, approvedBy, status: "disabled" });
  }

  function listAnchorsForOperator(operatorId) {
    return db.prepare("SELECT * FROM users WHERE role = 'anchor' AND operator_id = ? ORDER BY created_at ASC").all(operatorId).map(mapUser);
  }

  function actorRow(actor) {
    const row = actor && actor.id ? getUserById.get(actor.id) : null;
    if (!row || row.status !== "active") throw new Error("ACTIVE_USER_REQUIRED");
    return row;
  }

  function mapBrother(row) {
    if (!row) return null;
    let profile = null;
    try { profile = JSON.parse(row.profile_json || "null"); } catch { profile = null; }
    return {
      id: row.id,
      clientId: row.client_id,
      ownerUserId: row.owner_user_id,
      operatorId: row.operator_id || null,
      nickname: row.nickname,
      note: row.note || "",
      profile,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: Number(row.message_count || 0),
      latestMessageAt: row.latest_message_at || null,
    };
  }

  function mapChatMessage(row) {
    if (!row) return null;
    let policyWarnings = [];
    try { policyWarnings = JSON.parse(row.policy_warnings || "[]"); } catch { policyWarnings = []; }
    return {
      id: row.id,
      brotherId: row.brother_id,
      actorUserId: row.actor_user_id,
      sender: row.sender,
      direction: row.direction,
      source: row.source,
      status: row.status,
      text: row.text,
      policyWarnings: Array.isArray(policyWarnings) ? policyWarnings : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      confirmedAt: row.confirmed_at || null,
      sentAt: row.sent_at || null,
    };
  }

  function chatBrotherForActor(brotherId, actor) {
    const row = db.prepare("SELECT * FROM chat_brothers WHERE id = ?").get(cleanText(brotherId, 120));
    if (!row) throw new Error("CHAT_BROTHER_NOT_FOUND");
    const current = actorRow(actor);
    const allowed = current.role === "super_admin"
      || row.owner_user_id === current.id
      || (current.role === "operator" && row.operator_id === current.id);
    if (!allowed) throw new Error("CHAT_ACCESS_DENIED");
    return row;
  }

  function createChatBrother({ actor, clientId, nickname, note = "", profile = null }) {
    const current = actorRow(actor);
    if (!new Set(["operator", "anchor"]).has(current.role)) throw new Error("CHAT_WRITE_DENIED");
    const safeClientId = cleanText(clientId, 120);
    const safeNickname = cleanText(nickname, 80);
    if (!safeClientId || !safeNickname) throw new Error("CHAT_BROTHER_REQUIRED");
    const existing = db.prepare("SELECT * FROM chat_brothers WHERE owner_user_id = ? AND client_id = ?").get(current.id, safeClientId);
    if (existing) return mapBrother(existing);
    const timestamp = nowIso();
    const id = crypto.randomUUID();
    const operatorId = current.role === "operator" ? current.id : current.operator_id;
    db.prepare("INSERT INTO chat_brothers (id, client_id, owner_user_id, operator_id, nickname, note, profile_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, safeClientId, current.id, operatorId || null, safeNickname, cleanText(note, 240), JSON.stringify(profile && typeof profile === "object" ? profile : {}), timestamp, timestamp);
    audit({ actorUserId: current.id, action: "chat.brother.create", metadata: { brotherId: id, operatorId: operatorId || null } });
    return mapBrother(db.prepare("SELECT * FROM chat_brothers WHERE id = ?").get(id));
  }

  function listChatBrothers({ actor, limit = 200 } = {}) {
    const current = actorRow(actor);
    const boundedLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 200, 500));
    const base = `SELECT b.*, (SELECT COUNT(*) FROM chat_messages m WHERE m.brother_id = b.id) AS message_count, (SELECT MAX(m.created_at) FROM chat_messages m WHERE m.brother_id = b.id) AS latest_message_at FROM chat_brothers b`;
    if (current.role === "super_admin") return db.prepare(`${base} ORDER BY b.updated_at DESC LIMIT ?`).all(boundedLimit).map(mapBrother);
    if (current.role === "operator") return db.prepare(`${base} WHERE b.operator_id = ? ORDER BY b.updated_at DESC LIMIT ?`).all(current.id, boundedLimit).map(mapBrother);
    if (current.role === "anchor") return db.prepare(`${base} WHERE b.owner_user_id = ? ORDER BY b.updated_at DESC LIMIT ?`).all(current.id, boundedLimit).map(mapBrother);
    throw new Error("CHAT_ACCESS_DENIED");
  }

  function appendChatMessage({ actor, brotherId, message = {} }) {
    const brother = chatBrotherForActor(brotherId, actor);
    const current = actorRow(actor);
    const sender = message.sender === "anchor" ? "anchor" : message.sender === "brother" ? "brother" : "";
    const status = ["draft", "pending_confirmation", "confirmed", "sent", "discarded"].includes(message.status) ? message.status : "";
    const source = cleanText(message.source, 40);
    const text = cleanText(message.text, 2000);
    if (!sender || !status || !source || !text) throw new Error("CHAT_MESSAGE_INVALID");
    if (status === "sent" && sender !== "anchor") throw new Error("ONLY_ANCHOR_CAN_BE_SENT");
    const id = cleanText(message.id, 120) || crypto.randomUUID();
    const existing = db.prepare("SELECT * FROM chat_messages WHERE id = ?").get(id);
    if (existing) {
      if (existing.brother_id !== brother.id) throw new Error("DUPLICATE_MESSAGE_ID");
      return mapChatMessage(existing);
    }
    const createdAt = typeof message.createdAt === "string" && !Number.isNaN(Date.parse(message.createdAt)) ? new Date(message.createdAt).toISOString() : nowIso();
    const updatedAt = typeof message.updatedAt === "string" && !Number.isNaN(Date.parse(message.updatedAt)) ? new Date(message.updatedAt).toISOString() : createdAt;
    const confirmedAt = message.confirmedAt && !Number.isNaN(Date.parse(message.confirmedAt)) ? new Date(message.confirmedAt).toISOString() : (status === "confirmed" || status === "sent" ? createdAt : null);
    const sentAt = message.sentAt && !Number.isNaN(Date.parse(message.sentAt)) ? new Date(message.sentAt).toISOString() : (status === "sent" ? createdAt : null);
    const warnings = Array.isArray(message.policyWarnings) ? message.policyWarnings.slice(0, 8).map((item) => cleanText(item, 160)).filter(Boolean) : [];
    db.prepare("INSERT INTO chat_messages (id, brother_id, actor_user_id, sender, direction, source, status, text, policy_warnings, created_at, updated_at, confirmed_at, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, brother.id, current.id, sender, sender === "anchor" ? "right" : "left", source, status, text, JSON.stringify(warnings), createdAt, updatedAt, confirmedAt, sentAt);
    db.prepare("UPDATE chat_brothers SET updated_at = ? WHERE id = ?").run(updatedAt, brother.id);
    audit({ actorUserId: current.id, action: "chat.message.append", metadata: { brotherId: brother.id, messageId: id, sender, status } });
    return mapChatMessage(db.prepare("SELECT * FROM chat_messages WHERE id = ?").get(id));
  }

  function listChatMessages({ actor, brotherId, limit = 1000 } = {}) {
    const brother = chatBrotherForActor(brotherId, actor);
    const boundedLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 1000, 2000));
    return db.prepare("SELECT * FROM chat_messages WHERE brother_id = ? ORDER BY created_at ASC LIMIT ?").all(brother.id, boundedLimit).map(mapChatMessage);
  }

  function getOperatorOverview({ actor, limit = 100 } = {}) {
    const current = actorRow(actor);
    if (!["operator", "super_admin"].includes(current.role)) throw new Error("OPERATOR_VIEW_REQUIRED");
    const boundedLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 100, 500));
    const operatorWhere = current.role === "operator" ? "WHERE u.id = ?" : "WHERE u.role = 'operator'";
    const operatorParams = current.role === "operator" ? [current.id] : [];
    const operators = db.prepare(`SELECT u.id, u.phone, u.name, u.status, u.created_at as createdAt, (SELECT COUNT(*) FROM users a WHERE a.operator_id = u.id AND a.role = 'anchor') AS anchorCount, (SELECT COUNT(*) FROM chat_brothers b WHERE b.operator_id = u.id) AS brotherCount, (SELECT COUNT(*) FROM chat_messages m JOIN chat_brothers b ON b.id = m.brother_id WHERE b.operator_id = u.id) AS messageCount FROM users u ${operatorWhere} ORDER BY u.created_at ASC`).all(...operatorParams);
    const anchorWhere = current.role === "operator" ? "WHERE u.operator_id = ?" : "WHERE u.role = 'anchor'";
    const anchorParams = current.role === "operator" ? [current.id] : [];
    const anchors = db.prepare(`SELECT u.id, u.phone, u.name, u.status, u.operator_id as operatorId, u.created_at as createdAt, (SELECT COUNT(*) FROM chat_brothers b WHERE b.owner_user_id = u.id) AS brotherCount, (SELECT COUNT(*) FROM chat_messages m WHERE m.actor_user_id = u.id) AS messageCount FROM users u ${anchorWhere} ORDER BY u.created_at ASC`).all(...anchorParams);
    const messageScope = current.role === "operator" ? "WHERE b.operator_id = ?" : "";
    const messageParams = current.role === "operator" ? [current.id, boundedLimit] : [boundedLimit];
    const recentMessages = db.prepare(`SELECT m.id, m.brother_id as brotherId, b.nickname as brotherNickname, m.actor_user_id as anchorId, a.name as anchorName, b.operator_id as operatorId, o.name as operatorName, m.sender, m.status, m.text, m.created_at as createdAt, m.sent_at as sentAt FROM chat_messages m JOIN chat_brothers b ON b.id = m.brother_id JOIN users a ON a.id = b.owner_user_id LEFT JOIN users o ON o.id = b.operator_id ${messageScope} ORDER BY m.created_at DESC LIMIT ?`).all(...messageParams);
    return { operators, anchors, recentMessages };
  }

  function listAuditLogs({ actor, actorUserId, limit = 50, cursor = "", action = "", role = "", from = "", to = "" } = {}) {
    const current = actor || (actorUserId ? getUser(actorUserId) : null);
    const active = actorRow(current);
    if (!["operator", "super_admin"].includes(active.role)) throw new Error("AUDIT_ACCESS_DENIED");

    const requestedLimit = limit === undefined || limit === null || limit === "" ? 50 : Number(limit);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) throw new Error("AUDIT_QUERY_INVALID");
    const actionFilter = cleanText(action, 80);
    if (actionFilter && !AUDIT_ACTIONS.has(actionFilter)) throw new Error("AUDIT_QUERY_INVALID");
    const roleFilter = cleanText(role, 40);
    if (roleFilter && !ROLES.has(roleFilter)) throw new Error("AUDIT_QUERY_INVALID");
    const parseDateFilter = (value) => {
      if (!value) return "";
      if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error("AUDIT_QUERY_INVALID");
      return new Date(value).toISOString();
    };
    const fromFilter = parseDateFilter(from);
    const toFilter = parseDateFilter(to);
    if (fromFilter && toFilter && fromFilter > toFilter) throw new Error("AUDIT_QUERY_INVALID");
    const pageCursor = decodeAuditCursor(cursor);

    const conditions = [];
    const params = [];
    if (active.role === "operator") {
      conditions.push("(l.actor_user_id = ? OR actor.operator_id = ? OR target.operator_id = ?)");
      params.push(active.id, active.id, active.id);
    }
    if (actionFilter) {
      conditions.push("l.action = ?");
      params.push(actionFilter);
    }
    if (roleFilter) {
      conditions.push("(actor.role = ? OR target.role = ?)");
      params.push(roleFilter, roleFilter);
    }
    if (fromFilter) {
      conditions.push("l.created_at >= ?");
      params.push(fromFilter);
    }
    if (toFilter) {
      conditions.push("l.created_at <= ?");
      params.push(toFilter);
    }
    if (pageCursor) {
      conditions.push("(l.created_at < ? OR (l.created_at = ? AND l.id < ?))");
      params.push(pageCursor.createdAt, pageCursor.createdAt, pageCursor.id);
    }
    const query = `SELECT l.id, l.actor_user_id as actorId, l.action, l.target_user_id as targetId, l.metadata, l.created_at as createdAt,
      actor.name as actorName, actor.phone as actorPhone, actor.role as actorRole,
      target.name as targetName, target.phone as targetPhone, target.role as targetRole
      FROM audit_logs l
      LEFT JOIN users actor ON actor.id = l.actor_user_id
      LEFT JOIN users target ON target.id = l.target_user_id
      ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
      ORDER BY l.created_at DESC, l.id DESC LIMIT ?`;
    const rows = db.prepare(query).all(...params, requestedLimit + 1);
    const hasMore = rows.length > requestedLimit;
    const visibleRows = rows.slice(0, requestedLimit);
    const getMessage = db.prepare(`SELECT m.id, m.brother_id as brotherId, m.sender, m.direction, m.status, m.text, m.confirmed_at as confirmedAt, m.sent_at as sentAt,
      b.nickname as brotherNickname, b.operator_id as operatorId
      FROM chat_messages m JOIN chat_brothers b ON b.id = m.brother_id WHERE m.id = ?`);
    const items = visibleRows.map((row) => {
      const metadata = parseAuditMetadata(row.metadata);
      const actorInfo = row.actorId ? { id: row.actorId, name: row.actorName, role: row.actorRole, phone: maskPhone(row.actorPhone) } : null;
      const targetInfo = row.targetId ? { id: row.targetId, name: row.targetName, role: row.targetRole, phone: maskPhone(row.targetPhone) } : null;
      const messageId = typeof metadata.messageId === "string" ? metadata.messageId : "";
      const messageRow = messageId ? getMessage.get(messageId) : null;
      const messageVisible = messageRow && (active.role === "super_admin" || messageRow.operatorId === active.id);
      const chatMessage = messageVisible ? {
        id: messageRow.id,
        brotherNickname: messageRow.brotherNickname,
        sender: messageRow.sender,
        direction: messageRow.direction,
        status: messageRow.status,
        text: messageRow.text,
        confirmedAt: messageRow.confirmedAt || null,
        sentAt: messageRow.sentAt || null,
      } : null;
      return {
        id: row.id,
        action: row.action,
        actor: actorInfo,
        target: targetInfo,
        metadata,
        createdAt: row.createdAt,
        chatMessage,
      };
    });
    const last = visibleRows[visibleRows.length - 1];
    return {
      items,
      nextCursor: hasMore && last ? encodeAuditCursor({ createdAt: last.createdAt, id: last.id }) : null,
    };
  }

  return {
    ensureBootstrapAdmin,
    registerOperator,
    registerAnchorApplication,
    approveOperator,
    rejectOperator,
    createAnchor,
    authenticate,
    getAccountState,
    createSession,
    getSessionUser,
    revokeSession,
    listPendingOperators,
    listActiveOperators,
    listPendingAnchorsForOperator,
    approveAnchor,
    rejectAnchor,
    listAnchorsForOperator,
    createChatBrother,
    listChatBrothers,
    appendChatMessage,
    listChatMessages,
    getOperatorOverview,
    listAuditLogs,
    getUser,
    close: () => db.close(),
  };
}

module.exports = {
  createAuthStore,
  normalizePhone,
  hashPassword,
  verifyPassword,
};
