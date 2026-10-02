const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const { normalizeTask, transitionTask } = require("./maintenance-task.cjs");
const { normalizeReplyStyle } = require("./reply-style.cjs");

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
  "user.disable",
  "user.restore",
  "user.delete",
  "chat.brother.create",
  "chat.message.append",
  "chat.message.edit",
  "chat.message.mark",
  "chat.timeline.create",
  "chat.operator.note.create",
  "chat.task.create",
  "chat.task.update",
  "chat.task.complete",
  "chat.workspace.snapshot",
  "chat.reply.history.create",
  "chat.runtime.memory.enable",
  "chat.runtime.memory.pause",
  "chat.runtime.memory.resume",
  "chat.runtime.memory.apply",
  "chat.runtime.memory.undo",
  "chat.runtime.memory.forget",
  "chat.runtime.memory.revoke",
  "chat.runtime.memory.clear",
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

function parseAuditSnapshot(value) {
  let parsed = null;
  try {
    const candidate = JSON.parse(value || "null");
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) parsed = candidate;
  } catch {
    parsed = null;
  }
  return parsed;
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
      actor_snapshot_json TEXT NOT NULL DEFAULT '{}',
      target_snapshot_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (actor_user_id) REFERENCES users(id),
      FOREIGN KEY (target_user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_user_id);
    CREATE TABLE IF NOT EXISTS delete_confirmations (
      token_hash TEXT PRIMARY KEY,
      target_user_id TEXT NOT NULL,
      actor_user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_delete_confirmations_expiry ON delete_confirmations(expires_at);
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
      is_favorite INTEGER NOT NULL DEFAULT 0,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (brother_id) REFERENCES chat_brothers(id) ON DELETE CASCADE,
      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_brother_time ON chat_messages(brother_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_actor_time ON chat_messages(actor_user_id, created_at);
    CREATE TABLE IF NOT EXISTS workspace_snapshots (
      brother_id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      snapshot_json TEXT NOT NULL DEFAULT '{}',
      latest_draft TEXT NOT NULL DEFAULT '',
      latest_ai_candidates_json TEXT NOT NULL DEFAULT '[]',
      profile_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (brother_id) REFERENCES chat_brothers(id) ON DELETE CASCADE,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_snapshots_owner ON workspace_snapshots(owner_user_id, updated_at);
    CREATE TABLE IF NOT EXISTS reply_history (
      id TEXT PRIMARY KEY,
      brother_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      operator_id TEXT,
      source_message_id TEXT,
      current_message TEXT NOT NULL DEFAULT '',
      reply_style TEXT NOT NULL DEFAULT 'balanced',
      replies_json TEXT NOT NULL DEFAULT '[]',
      profile_json TEXT NOT NULL DEFAULT '{}',
      core_decision_json TEXT NOT NULL DEFAULT '{}',
      algorithm_core_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (brother_id) REFERENCES chat_brothers(id) ON DELETE CASCADE,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reply_history_brother_time ON reply_history(brother_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reply_history_owner_time ON reply_history(owner_user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS maintenance_tasks (
      id TEXT PRIMARY KEY,
      brother_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      operator_id TEXT,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'normal',
      title TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      next_action TEXT NOT NULL DEFAULT '',
      source_message_id TEXT,
      due_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (brother_id) REFERENCES chat_brothers(id) ON DELETE CASCADE,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_owner_status ON maintenance_tasks(owner_user_id, status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_operator_status ON maintenance_tasks(operator_id, status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_brother ON maintenance_tasks(brother_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_source ON maintenance_tasks(source_message_id);
    CREATE TABLE IF NOT EXISTS relationship_events (
      id TEXT PRIMARY KEY,
      brother_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      operator_id TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      occurred_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (brother_id) REFERENCES chat_brothers(id) ON DELETE CASCADE,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_relationship_events_brother_time ON relationship_events(brother_id, occurred_at DESC);
    CREATE TABLE IF NOT EXISTS operator_notes (
      id TEXT PRIMARY KEY,
      brother_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      operator_id TEXT,
      body TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (brother_id) REFERENCES chat_brothers(id) ON DELETE CASCADE,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_operator_notes_brother_time ON operator_notes(brother_id, created_at DESC);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS goutoujunshi_memory_settings (
      owner_user_id TEXT NOT NULL,
      brother_id TEXT NOT NULL,
      consent_enabled INTEGER NOT NULL DEFAULT 0,
      paused INTEGER NOT NULL DEFAULT 0,
      consent_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (owner_user_id, brother_id),
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (brother_id) REFERENCES chat_brothers(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS goutoujunshi_memories (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      brother_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      field TEXT NOT NULL,
      value TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_ref TEXT NOT NULL DEFAULT '',
      occurred_at TEXT,
      confidence TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (brother_id) REFERENCES chat_brothers(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_goutou_memory_lookup ON goutoujunshi_memories(owner_user_id, brother_id, status, updated_at);
    CREATE TABLE IF NOT EXISTS goutoujunshi_memory_operations (
      op_id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      brother_id TEXT NOT NULL,
      action TEXT NOT NULL,
      before_json TEXT NOT NULL,
      after_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (brother_id) REFERENCES chat_brothers(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_goutou_memory_operations_lookup ON goutoujunshi_memory_operations(owner_user_id, brother_id, created_at DESC);
  `);

  const auditColumns = new Set(db.prepare("PRAGMA table_info(audit_logs)").all().map((column) => column.name));
  if (!auditColumns.has("actor_snapshot_json")) db.exec("ALTER TABLE audit_logs ADD COLUMN actor_snapshot_json TEXT NOT NULL DEFAULT '{}'");
  if (!auditColumns.has("target_snapshot_json")) db.exec("ALTER TABLE audit_logs ADD COLUMN target_snapshot_json TEXT NOT NULL DEFAULT '{}'");
  const messageColumns = new Set(db.prepare("PRAGMA table_info(chat_messages)").all().map((column) => column.name));
  if (!messageColumns.has("is_favorite")) db.exec("ALTER TABLE chat_messages ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0");
  if (!messageColumns.has("is_pinned")) db.exec("ALTER TABLE chat_messages ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0");

  const getUserById = db.prepare("SELECT * FROM users WHERE id = ?");
  const getUserByPhone = db.prepare("SELECT * FROM users WHERE phone = ?");
  const insertUser = db.prepare(`INSERT INTO users (id, phone, name, password_hash, role, status, operator_id, created_at, approved_by, approved_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertAudit = db.prepare("INSERT INTO audit_logs (id, actor_user_id, action, target_user_id, metadata, actor_snapshot_json, target_snapshot_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");

  function auditSnapshot(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: cleanText(row.name, 80),
      role: row.role,
      status: row.status,
      phone: maskPhone(row.phone),
      operatorId: row.operator_id || null,
    };
  }

  function audit({ actorUserId = null, action, targetUserId = null, metadata = {}, actorSnapshot = null, targetSnapshot = null }) {
    const actorRowSnapshot = actorSnapshot || auditSnapshot(actorUserId ? getUserById.get(actorUserId) : null);
    const targetRowSnapshot = targetSnapshot || auditSnapshot(targetUserId ? getUserById.get(targetUserId) : null);
    insertAudit.run(
      crypto.randomUUID(),
      actorUserId,
      cleanText(action, 80),
      targetUserId,
      JSON.stringify(sanitizeAuditValue(metadata) || {}).slice(0, 2000),
      JSON.stringify(sanitizeAuditValue(actorRowSnapshot) || {}).slice(0, 1200),
      JSON.stringify(sanitizeAuditValue(targetRowSnapshot) || {}).slice(0, 1200),
      nowIso(),
    );
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

  function listPendingAnchorsForApprover(approverId) {
    const approver = getUserById.get(cleanText(approverId, 120));
    if (!approver || !["operator", "super_admin"].includes(approver.role) || approver.status !== "active") throw new Error("ANCHOR_APPROVAL_FORBIDDEN");
    if (approver.role === "super_admin") {
      return db.prepare("SELECT * FROM users WHERE role = 'anchor' AND status = 'pending' ORDER BY created_at ASC").all().map(mapUser);
    }
    return listPendingAnchorsForOperator(approver.id);
  }

  function changeAnchorStatus({ anchorId, approvedBy, status }) {
    const anchor = getUserById.get(cleanText(anchorId, 120));
    const approver = getUserById.get(cleanText(approvedBy, 120));
    if (!anchor || anchor.role !== "anchor" || anchor.status !== "pending") throw new Error("ANCHOR_NOT_PENDING");
    const isSuperAdmin = approver?.role === "super_admin" && approver.status === "active";
    const isAssignedOperator = approver?.role === "operator" && approver.status === "active" && anchor.operator_id === approver.id;
    if (!isSuperAdmin && !isAssignedOperator) throw new Error("ANCHOR_APPROVAL_FORBIDDEN");
    const timestamp = nowIso();
    db.prepare("UPDATE users SET status = ?, approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?").run(status, approver.id, timestamp, timestamp, anchor.id);
    audit({ actorUserId: approver.id, action: status === "active" ? "anchor.approve" : "anchor.reject", targetUserId: anchor.id, metadata: { role: "anchor", operatorId: anchor.operator_id || null, approverRole: approver.role } });
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

  function superAdminRow(actor) {
    const current = actorRow(actor);
    if (current.role !== "super_admin") throw new Error("SUPER_ADMIN_REQUIRED");
    return current;
  }

  function activeSuperAdminCount() {
    return Number(db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'super_admin' AND status = 'active'").get().count);
  }

  function assertTargetCanBeManaged(current, target) {
    if (!target) throw new Error("USER_NOT_FOUND");
    if (target.id === current.id) throw new Error("USER_STATUS_FORBIDDEN");
    if (target.role === "super_admin" && target.status === "active" && activeSuperAdminCount() <= 1) {
      throw new Error("USER_STATUS_FORBIDDEN");
    }
  }

  function usageStatus(row) {
    if (Number(row.active_session_count) > 0) return "online";
    const lastSeen = row.last_action_at || row.last_login_at;
    if (!lastSeen) return "unused";
    const age = Date.now() - Date.parse(lastSeen);
    if (age <= 24 * 60 * 60 * 1000) return "recent";
    return "inactive";
  }

  function listUserUsage({ actor } = {}) {
    superAdminRow(actor);
    const rows = db.prepare(`
      SELECT u.id, u.phone, u.name, u.role, u.status, u.operator_id AS operatorId,
        u.created_at AS createdAt, u.updated_at AS updatedAt,
        op.name AS operatorName, op.phone AS operatorPhone,
        (SELECT COUNT(*) FROM chat_brothers b WHERE b.owner_user_id = u.id) AS brotherCount,
        (SELECT COUNT(*) FROM chat_messages m WHERE m.actor_user_id = u.id) AS messageCount,
        (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS activeSessionCount,
        (SELECT MAX(l.created_at) FROM audit_logs l WHERE l.actor_user_id = u.id AND l.action = 'auth.login') AS lastLoginAt,
        (SELECT MAX(l.created_at) FROM audit_logs l WHERE l.actor_user_id = u.id) AS lastActionAt
      FROM users u
      LEFT JOIN users op ON op.id = u.operator_id
      ORDER BY CASE u.role WHEN 'super_admin' THEN 0 WHEN 'operator' THEN 1 ELSE 2 END, u.created_at ASC
    `).all(Date.now());
    return {
      items: rows.map((row) => ({
        id: row.id,
        phone: maskPhone(row.phone),
        name: row.name,
        role: row.role,
        status: row.status,
        usageStatus: usageStatus(row),
        operator: row.operatorId ? { id: row.operatorId, name: row.operatorName, phone: maskPhone(row.operatorPhone) } : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        brotherCount: Number(row.brotherCount || 0),
        messageCount: Number(row.messageCount || 0),
        activeSessionCount: Number(row.activeSessionCount || 0),
        lastLoginAt: row.lastLoginAt || null,
        lastActionAt: row.lastActionAt || null,
      })),
    };
  }

  function changeUserStatus({ actor, targetUserId, status }) {
    const current = superAdminRow(actor);
    const nextStatus = cleanText(status, 20);
    if (!["active", "disabled"].includes(nextStatus)) throw new Error("USER_STATUS_INVALID");
    const target = getUserById.get(cleanText(targetUserId, 120));
    assertTargetCanBeManaged(current, target);
    if (target.status === nextStatus) return mapUser(target);
    const timestamp = nowIso();
    const update = db.transaction(() => {
      db.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?").run(nextStatus, timestamp, target.id);
      if (nextStatus === "disabled") db.prepare("DELETE FROM sessions WHERE user_id = ?").run(target.id);
      audit({
        actorUserId: current.id,
        action: nextStatus === "disabled" ? "user.disable" : "user.restore",
        targetUserId: target.id,
        metadata: { role: target.role, status: nextStatus },
      });
      return getUserById.get(target.id);
    });
    return mapUser(update());
  }

  function prepareUserDeletion({ actor, targetUserId, ttlMs = 90 * 1000 }) {
    const current = superAdminRow(actor);
    const target = getUserById.get(cleanText(targetUserId, 120));
    if (target && target.id === current.id) throw new Error("USER_DELETE_FORBIDDEN");
    assertTargetCanBeManaged(current, target);
    db.prepare("DELETE FROM delete_confirmations WHERE expires_at <= ?").run(Date.now());
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + Math.max(30_000, Math.min(Number(ttlMs) || 90_000, 5 * 60_000));
    db.prepare("INSERT INTO delete_confirmations (token_hash, target_user_id, actor_user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(hashToken(token), target.id, current.id, expiresAt, nowIso());
    return { token, expiresAt };
  }

  function confirmUserDeletion({ actor, targetUserId, token }) {
    const current = superAdminRow(actor);
    const safeToken = typeof token === "string" ? token : "";
    const confirmation = db.prepare("SELECT * FROM delete_confirmations WHERE token_hash = ?").get(hashToken(safeToken));
    if (!confirmation || confirmation.actor_user_id !== current.id || confirmation.target_user_id !== cleanText(targetUserId, 120) || confirmation.expires_at <= Date.now()) {
      throw new Error("USER_DELETE_CONFIRMATION_INVALID");
    }
    const target = getUserById.get(confirmation.target_user_id);
    if (target && target.id === current.id) throw new Error("USER_DELETE_FORBIDDEN");
    assertTargetCanBeManaged(current, target);
    if (target.role === "operator") {
      const dependentCount = Number(db.prepare("SELECT COUNT(*) AS count FROM users WHERE operator_id = ?").get(target.id).count);
      if (dependentCount > 0) throw new Error("USER_DELETE_HAS_DEPENDENTS");
    }
    const actorSnapshot = auditSnapshot(current);
    const targetSnapshot = auditSnapshot(target);
    const deletedUserId = target.id;
    db.transaction(() => {
      db.prepare(`UPDATE audit_logs
        SET actor_snapshot_json = CASE WHEN actor_snapshot_json IS NULL OR actor_snapshot_json = '{}' THEN ? ELSE actor_snapshot_json END,
            actor_user_id = NULL
        WHERE actor_user_id = ?`).run(JSON.stringify(actorSnapshot), target.id);
      db.prepare(`UPDATE audit_logs
        SET target_snapshot_json = CASE WHEN target_snapshot_json IS NULL OR target_snapshot_json = '{}' THEN ? ELSE target_snapshot_json END,
            target_user_id = NULL
        WHERE target_user_id = ?`).run(JSON.stringify(targetSnapshot), target.id);
      db.prepare("UPDATE users SET approved_by = NULL WHERE approved_by = ?").run(target.id);
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(target.id);
      db.prepare("DELETE FROM chat_messages WHERE actor_user_id = ?").run(target.id);
      db.prepare("DELETE FROM chat_brothers WHERE owner_user_id = ?").run(target.id);
      audit({
        actorUserId: current.id,
        action: "user.delete",
        metadata: { deletedUserId, role: target.role },
        actorSnapshot,
        targetSnapshot,
      });
      db.prepare("DELETE FROM delete_confirmations WHERE token_hash = ?").run(confirmation.token_hash);
      db.prepare("DELETE FROM users WHERE id = ?").run(target.id);
    })();
    return { deletedUserId, target: targetSnapshot };
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
      favorite: Boolean(row.is_favorite),
      pinned: Boolean(row.is_pinned),
    };
  }

  function mapRelationshipEvent(row) {
    if (!row) return null;
    return {
      id: row.id,
      brotherId: row.brother_id,
      ownerUserId: row.owner_user_id,
      operatorId: row.operator_id || null,
      type: row.type,
      title: row.title,
      body: row.body || "",
      occurredAt: row.occurred_at,
      createdBy: row.created_by,
      createdByName: row.created_by_name || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function mapOperatorNote(row) {
    if (!row) return null;
    return {
      id: row.id,
      brotherId: row.brother_id,
      ownerUserId: row.owner_user_id,
      operatorId: row.operator_id || null,
      body: row.body,
      createdBy: row.created_by,
      createdByName: row.created_by_name || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function mapReplyHistory(row) {
    if (!row) return null;
    let replies = [];
    let profile = null;
    let coreDecision = null;
    let algorithmCore = null;
    try { replies = JSON.parse(row.replies_json || "[]"); } catch { replies = []; }
    try { profile = JSON.parse(row.profile_json || "null"); } catch { profile = null; }
    try { coreDecision = JSON.parse(row.core_decision_json || "null"); } catch { coreDecision = null; }
    try { algorithmCore = JSON.parse(row.algorithm_core_json || "null"); } catch { algorithmCore = null; }
    return {
      id: row.id,
      brotherId: row.brother_id,
      ownerUserId: row.owner_user_id,
      operatorId: row.operator_id || null,
      sourceMessageId: row.source_message_id || null,
      currentMessage: row.current_message || "",
      replyStyle: normalizeReplyStyle(row.reply_style),
      replies: Array.isArray(replies) ? replies : [],
      profile,
      coreDecision,
      algorithmCore,
      createdAt: row.created_at,
    };
  }

  function mapMaintenanceTask(row) {
    if (!row) return null;
    return normalizeTask({
      id: row.id,
      brotherId: row.brother_id,
      ownerUserId: row.owner_user_id,
      operatorId: row.operator_id,
      type: row.type,
      status: row.status,
      priority: row.priority,
      title: row.title,
      reason: row.reason,
      nextAction: row.next_action,
      sourceMessageId: row.source_message_id,
      dueAt: row.due_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
    });
  }

  function maintenanceTaskForActor(taskId, actor, { write = false } = {}) {
    const current = actorRow(actor);
    const row = db.prepare("SELECT * FROM maintenance_tasks WHERE id = ?").get(cleanText(taskId, 120));
    if (!row) throw new Error("TASK_NOT_FOUND");
    const visible = current.role === "super_admin"
      || (current.role === "operator" && row.operator_id === current.id)
      || (current.role === "anchor" && row.owner_user_id === current.id);
    if (!visible) throw new Error("TASK_ACCESS_DENIED");
    if (write && (current.role !== "anchor" || row.owner_user_id !== current.id)) throw new Error("TASK_WRITE_DENIED");
    return { current, row };
  }

  function ensureReplyTask({ brother, actor, messageId, createdAt }) {
    const existing = db.prepare("SELECT * FROM maintenance_tasks WHERE source_message_id = ? AND type = 'reply' LIMIT 1").get(messageId);
    if (existing) return mapMaintenanceTask(existing);
    const taskId = crypto.randomUUID();
    const timestamp = typeof createdAt === "string" && !Number.isNaN(Date.parse(createdAt)) ? new Date(createdAt).toISOString() : nowIso();
    db.prepare(`INSERT INTO maintenance_tasks
      (id, brother_id, owner_user_id, operator_id, type, status, priority, title, reason, next_action, source_message_id, due_at, created_at, updated_at, completed_at)
      VALUES (?, ?, ?, ?, 'reply', 'pending_reply', 'normal', ?, ?, ?, ?, ?, ?, ?, NULL)`)
      .run(taskId, brother.id, brother.owner_user_id, brother.operator_id || null, "回复大哥消息", "收到新的大哥消息，等待主播确认处理", "先阅读完整上下文，再选择或修改 AI 候选", messageId, null, timestamp, timestamp);
    audit({ actorUserId: actor.id, action: "chat.task.create", metadata: { taskId, brotherId: brother.id, sourceMessageId: messageId, type: "reply" } });
    return mapMaintenanceTask(db.prepare("SELECT * FROM maintenance_tasks WHERE id = ?").get(taskId));
  }

  function completeOpenReplyTasks({ brother, actor, completedAt }) {
    const openTasks = db.prepare("SELECT * FROM maintenance_tasks WHERE brother_id = ? AND type = 'reply' AND status IN ('pending_reply', 'follow_up', 'snoozed')").all(brother.id);
    if (!openTasks.length) return;
    const timestamp = typeof completedAt === "string" && !Number.isNaN(Date.parse(completedAt)) ? new Date(completedAt).toISOString() : nowIso();
    for (const row of openTasks) {
      const next = transitionTask(mapMaintenanceTask(row), "done", timestamp);
      db.prepare("UPDATE maintenance_tasks SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?").run(next.status, next.updatedAt, next.completedAt, row.id);
      audit({ actorUserId: actor.id, action: "chat.task.complete", metadata: { taskId: row.id, brotherId: brother.id, status: "done" } });
    }
  }

  function listMaintenanceTasks({ actor, brotherId = "", status = "", limit = 100 } = {}) {
    const current = actorRow(actor);
    const boundedLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 100, 500));
    const conditions = [];
    const params = [];
    if (current.role === "anchor") {
      conditions.push("t.owner_user_id = ?");
      params.push(current.id);
    } else if (current.role === "operator") {
      conditions.push("t.operator_id = ?");
      params.push(current.id);
    } else if (current.role !== "super_admin") {
      throw new Error("TASK_ACCESS_DENIED");
    }
    const requestedBrotherId = cleanText(brotherId, 120);
    if (requestedBrotherId) {
      conditions.push("t.brother_id = ?");
      params.push(requestedBrotherId);
    }
    const requestedStatus = cleanText(status, 40);
    if (requestedStatus) {
      if (!["pending_reply", "follow_up", "snoozed", "done", "dismissed"].includes(requestedStatus)) throw new Error("TASK_STATUS_INVALID");
      conditions.push("t.status = ?");
      params.push(requestedStatus);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = db.prepare(`SELECT t.*, b.nickname AS brother_nickname, a.name AS owner_name, o.name AS operator_name
      FROM maintenance_tasks t
      JOIN chat_brothers b ON b.id = t.brother_id
      JOIN users a ON a.id = t.owner_user_id
      LEFT JOIN users o ON o.id = t.operator_id
      ${where} ORDER BY CASE t.status WHEN 'pending_reply' THEN 0 WHEN 'follow_up' THEN 1 WHEN 'snoozed' THEN 2 ELSE 3 END, COALESCE(t.due_at, t.updated_at) ASC, t.updated_at DESC LIMIT ?`).all(...params, boundedLimit);
    const items = rows.map((row) => ({
      ...mapMaintenanceTask(row),
      brotherNickname: row.brother_nickname,
      ownerName: row.owner_name,
      operatorName: row.operator_name || null,
    }));
    const countConditions = conditions.filter((condition) => !condition.startsWith("t.status = ?"));
    const countParams = params.slice(0, countConditions.length);
    const countWhere = countConditions.length ? `WHERE ${countConditions.join(" AND ")}` : "";
    const countRows = db.prepare(`SELECT t.status, COUNT(*) AS count FROM maintenance_tasks t ${countWhere} GROUP BY t.status`).all(...countParams);
    const summary = { pendingReply: 0, followUp: 0, snoozed: 0, done: 0, dismissed: 0, total: 0 };
    for (const row of countRows) {
      const key = row.status === "pending_reply" ? "pendingReply" : row.status === "follow_up" ? "followUp" : row.status;
      if (Object.hasOwn(summary, key)) summary[key] = Number(row.count || 0);
      summary.total += Number(row.count || 0);
    }
    return { items, summary };
  }

  function updateMaintenanceTask({ actor, taskId, status, priority, title, reason, nextAction, dueAt } = {}) {
    const { current, row } = maintenanceTaskForActor(taskId, actor, { write: true });
    const existing = mapMaintenanceTask(row);
    const nextStatus = status === undefined || status === null || status === "" ? existing.status : cleanText(status, 40);
    const transitioned = transitionTask(existing, nextStatus, nowIso());
    const next = normalizeTask({
      ...transitioned,
      priority: priority || existing.priority,
      title: title === undefined ? existing.title : title,
      reason: reason === undefined ? existing.reason : reason,
      nextAction: nextAction === undefined ? existing.nextAction : nextAction,
      dueAt: dueAt === undefined ? existing.dueAt : dueAt,
    });
    db.prepare(`UPDATE maintenance_tasks SET status = ?, priority = ?, title = ?, reason = ?, next_action = ?, due_at = ?, updated_at = ?, completed_at = ? WHERE id = ?`)
      .run(next.status, next.priority, next.title, next.reason, next.nextAction, next.dueAt, next.updatedAt, next.completedAt, row.id);
    audit({ actorUserId: current.id, action: ["done", "dismissed"].includes(next.status) ? "chat.task.complete" : "chat.task.update", metadata: { taskId: row.id, brotherId: row.brother_id, status: next.status, priority: next.priority } });
    return mapMaintenanceTask(db.prepare("SELECT * FROM maintenance_tasks WHERE id = ?").get(row.id));
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
    if (current.role !== "anchor") throw new Error("CHAT_WRITE_DENIED");
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
    const order = "ORDER BY b.updated_at DESC, b.created_at DESC, b.client_id DESC, b.id DESC";
    if (current.role === "super_admin") return db.prepare(`${base} ${order} LIMIT ?`).all(boundedLimit).map(mapBrother);
    if (current.role === "operator") return db.prepare(`${base} WHERE b.operator_id = ? ${order} LIMIT ?`).all(current.id, boundedLimit).map(mapBrother);
    if (current.role === "anchor") return db.prepare(`${base} WHERE b.owner_user_id = ? ${order} LIMIT ?`).all(current.id, boundedLimit).map(mapBrother);
    throw new Error("CHAT_ACCESS_DENIED");
  }

  function appendChatMessage({ actor, brotherId, message = {} }) {
    const brother = chatBrotherForActor(brotherId, actor);
    const current = actorRow(actor);
    if (current.role !== "anchor" || brother.owner_user_id !== current.id) throw new Error("CHAT_WRITE_DENIED");
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
    if (sender === "brother" && status === "confirmed") ensureReplyTask({ brother, actor: current, messageId: id, createdAt });
    if (sender === "anchor" && status === "sent") completeOpenReplyTasks({ brother, actor: current, completedAt: sentAt || updatedAt });
    return mapChatMessage(db.prepare("SELECT * FROM chat_messages WHERE id = ?").get(id));
  }

  function editChatMessage({ actor, brotherId, messageId, text }) {
    const brother = chatBrotherForActor(brotherId, actor);
    const current = actorRow(actor);
    if (current.role !== "anchor" || brother.owner_user_id !== current.id) throw new Error("CHAT_WRITE_DENIED");
    const id = cleanText(messageId, 120);
    const nextText = cleanText(text, 2000);
    if (!id || !nextText) throw new Error("CHAT_MESSAGE_INVALID");
    const existing = db.prepare("SELECT * FROM chat_messages WHERE id = ? AND brother_id = ?").get(id, brother.id);
    if (!existing) throw new Error("CHAT_MESSAGE_NOT_FOUND");
    const previousTime = Date.parse(existing.updated_at) || Date.parse(existing.created_at) || 0;
    const updatedAt = new Date(Math.max(Date.now(), previousTime + 1)).toISOString();
    db.prepare("UPDATE chat_messages SET text = ?, updated_at = ? WHERE id = ? AND brother_id = ?")
      .run(nextText, updatedAt, id, brother.id);
    db.prepare("UPDATE chat_brothers SET updated_at = ? WHERE id = ?").run(updatedAt, brother.id);
    audit({ actorUserId: current.id, action: "chat.message.edit", metadata: { brotherId: brother.id, messageId: id, sender: existing.sender, status: existing.status } });
    return mapChatMessage(db.prepare("SELECT * FROM chat_messages WHERE id = ?").get(id));
  }

  function listChatMessages({ actor, brotherId, limit = 1000 } = {}) {
    const brother = chatBrotherForActor(brotherId, actor);
    const boundedLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 1000, 2000));
    return db.prepare("SELECT * FROM chat_messages WHERE brother_id = ? ORDER BY created_at ASC LIMIT ?").all(brother.id, boundedLimit).map(mapChatMessage);
  }

  function escapeLike(value) {
    return cleanText(value, 160).replace(/[\\%_]/g, (match) => `\\${match}`);
  }

  function searchChat({ actor, query = "", brotherId = "", limit = 50 } = {}) {
    const current = actorRow(actor);
    const term = cleanText(query, 160);
    if (!term) return { items: [], total: 0 };
    const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 50, 100));
    const conditions = ["(m.text LIKE ? ESCAPE '\\' OR b.nickname LIKE ? ESCAPE '\\' OR b.note LIKE ? ESCAPE '\\')"];
    const params = [`%${escapeLike(term)}%`, `%${escapeLike(term)}%`, `%${escapeLike(term)}%`];
    if (current.role === "anchor") {
      conditions.push("b.owner_user_id = ?");
      params.push(current.id);
    } else if (current.role === "operator") {
      conditions.push("b.operator_id = ?");
      params.push(current.id);
    } else if (current.role !== "super_admin") {
      throw new Error("CHAT_ACCESS_DENIED");
    }
    const requestedBrotherId = cleanText(brotherId, 120);
    if (requestedBrotherId) {
      conditions.push("b.id = ?");
      params.push(requestedBrotherId);
    }
    const rows = db.prepare(`SELECT m.id AS message_id, m.brother_id, m.sender, m.direction, m.status, m.text, m.created_at, m.sent_at,
      b.client_id, b.nickname, b.owner_user_id, b.operator_id, owner.name AS owner_name, op.name AS operator_name
      FROM chat_messages m
      JOIN chat_brothers b ON b.id = m.brother_id
      JOIN users owner ON owner.id = b.owner_user_id
      LEFT JOIN users op ON op.id = b.operator_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY m.created_at DESC LIMIT ?`).all(...params, safeLimit);
    return {
      items: rows.map((row) => ({
        messageId: row.message_id,
        brotherId: row.brother_id,
        clientId: row.client_id,
        brotherNickname: row.nickname,
        ownerUserId: row.owner_user_id,
        ownerName: row.owner_name,
        operatorId: row.operator_id || null,
        operatorName: row.operator_name || null,
        sender: row.sender,
        direction: row.direction,
        status: row.status,
        text: row.text,
        createdAt: row.created_at,
        sentAt: row.sent_at || null,
      })),
      total: rows.length,
    };
  }

  function setChatMessageMark({ actor, brotherId, messageId, favorite, pinned } = {}) {
    const brother = chatBrotherForActor(brotherId, actor);
    const current = actorRow(actor);
    if (current.role !== "anchor" || brother.owner_user_id !== current.id) throw new Error("CHAT_MARK_WRITE_DENIED");
    const id = cleanText(messageId, 120);
    const existing = db.prepare("SELECT * FROM chat_messages WHERE id = ? AND brother_id = ?").get(id, brother.id);
    if (!existing) throw new Error("CHAT_MESSAGE_NOT_FOUND");
    const nextFavorite = favorite === undefined ? Boolean(existing.is_favorite) : Boolean(favorite);
    const nextPinned = pinned === undefined ? Boolean(existing.is_pinned) : Boolean(pinned);
    db.transaction(() => {
      if (nextPinned) db.prepare("UPDATE chat_messages SET is_pinned = 0 WHERE brother_id = ?").run(brother.id);
      db.prepare("UPDATE chat_messages SET is_favorite = ?, is_pinned = ?, updated_at = ? WHERE id = ? AND brother_id = ?")
        .run(nextFavorite ? 1 : 0, nextPinned ? 1 : 0, nowIso(), id, brother.id);
      audit({ actorUserId: current.id, action: "chat.message.mark", metadata: { brotherId: brother.id, messageId: id, favorite: nextFavorite, pinned: nextPinned } });
    })();
    return mapChatMessage(db.prepare("SELECT * FROM chat_messages WHERE id = ?").get(id));
  }

  const RELATIONSHIP_EVENT_TYPES = new Set(["first_contact", "milestone", "follow_up", "boundary", "note", "custom"]);

  function createRelationshipEvent({ actor, brotherId, type, title, body = "", occurredAt } = {}) {
    const brother = chatBrotherForActor(brotherId, actor);
    const current = actorRow(actor);
    if (current.role !== "anchor" || brother.owner_user_id !== current.id) throw new Error("TIMELINE_WRITE_DENIED");
    const eventType = cleanText(type, 40);
    const eventTitle = cleanText(title, 120);
    if (!RELATIONSHIP_EVENT_TYPES.has(eventType) || !eventTitle) throw new Error("TIMELINE_EVENT_INVALID");
    const timestamp = typeof occurredAt === "string" && !Number.isNaN(Date.parse(occurredAt)) ? new Date(occurredAt).toISOString() : nowIso();
    const createdAt = nowIso();
    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO relationship_events (id, brother_id, owner_user_id, operator_id, type, title, body, occurred_at, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, brother.id, brother.owner_user_id, brother.operator_id || null, eventType, eventTitle, cleanText(body, 1200), timestamp, current.id, createdAt, createdAt);
    audit({ actorUserId: current.id, action: "chat.timeline.create", metadata: { brotherId: brother.id, eventId: id, type: eventType } });
    return mapRelationshipEvent(db.prepare("SELECT e.*, u.name AS created_by_name FROM relationship_events e LEFT JOIN users u ON u.id = e.created_by WHERE e.id = ?").get(id));
  }

  function listRelationshipEvents({ actor, brotherId, limit = 100 } = {}) {
    const brother = chatBrotherForActor(brotherId, actor);
    const boundedLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 100, 300));
    const rows = db.prepare(`SELECT e.*, u.name AS created_by_name FROM relationship_events e LEFT JOIN users u ON u.id = e.created_by
      WHERE e.brother_id = ? ORDER BY e.occurred_at DESC, e.created_at DESC LIMIT ?`).all(brother.id, boundedLimit);
    return { items: rows.map(mapRelationshipEvent) };
  }

  function assertOperatorNoteAccess(current, brother) {
    if (!["operator", "super_admin"].includes(current.role)) throw new Error("OPERATOR_NOTE_ACCESS_DENIED");
    if (current.role === "operator" && brother.operator_id !== current.id) throw new Error("OPERATOR_NOTE_ACCESS_DENIED");
  }

  function createOperatorNote({ actor, brotherId, body } = {}) {
    const current = actorRow(actor);
    if (!["operator", "super_admin"].includes(current.role)) throw new Error("OPERATOR_NOTE_ACCESS_DENIED");
    let brother;
    try { brother = chatBrotherForActor(brotherId, actor); } catch (error) {
      if (error?.message === "CHAT_ACCESS_DENIED" && current.role === "operator") throw new Error("OPERATOR_NOTE_ACCESS_DENIED");
      throw error;
    }
    assertOperatorNoteAccess(current, brother);
    const text = cleanText(body, 2000);
    if (!text) throw new Error("OPERATOR_NOTE_INVALID");
    const timestamp = nowIso();
    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO operator_notes (id, brother_id, owner_user_id, operator_id, body, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, brother.id, brother.owner_user_id, brother.operator_id || null, text, current.id, timestamp, timestamp);
    audit({ actorUserId: current.id, action: "chat.operator.note.create", metadata: { brotherId: brother.id, noteId: id } });
    return mapOperatorNote(db.prepare("SELECT n.*, u.name AS created_by_name FROM operator_notes n LEFT JOIN users u ON u.id = n.created_by WHERE n.id = ?").get(id));
  }

  function listOperatorNotes({ actor, brotherId, limit = 100 } = {}) {
    const current = actorRow(actor);
    if (!["operator", "super_admin"].includes(current.role)) throw new Error("OPERATOR_NOTE_ACCESS_DENIED");
    let brother;
    try { brother = chatBrotherForActor(brotherId, actor); } catch (error) {
      if (error?.message === "CHAT_ACCESS_DENIED" && current.role === "operator") throw new Error("OPERATOR_NOTE_ACCESS_DENIED");
      throw error;
    }
    assertOperatorNoteAccess(current, brother);
    const boundedLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 100, 300));
    const rows = db.prepare(`SELECT n.*, u.name AS created_by_name FROM operator_notes n LEFT JOIN users u ON u.id = n.created_by
      WHERE n.brother_id = ? ORDER BY n.created_at DESC LIMIT ?`).all(brother.id, boundedLimit);
    return { items: rows.map(mapOperatorNote) };
  }

  function mapWorkspaceSnapshot(row) {
    if (!row) return null;
    let snapshot = {};
    let replies = [];
    let profile = null;
    try { snapshot = JSON.parse(row.snapshot_json || "{}"); } catch { snapshot = {}; }
    try { replies = JSON.parse(row.latest_ai_candidates_json || "[]"); } catch { replies = []; }
    try { profile = JSON.parse(row.profile_json || "null"); } catch { profile = null; }
    return {
      brotherId: row.brother_id,
      ownerUserId: row.owner_user_id,
      latestDraft: row.latest_draft || "",
      replies: Array.isArray(replies) ? replies : [],
      profile,
      coreDecision: snapshot.coreDecision || null,
      algorithmCore: snapshot.algorithmCore || null,
      runtimeAnalysis: snapshot.runtimeAnalysis || null,
      runtimeIntake: snapshot.runtimeIntake || null,
      runtime: snapshot.runtime || null,
      openingTopics: Array.isArray(snapshot.openingTopics) ? snapshot.openingTopics : [],
      liveInvite: snapshot.liveInvite || null,
      replyStyle: normalizeReplyStyle(snapshot.replyStyle),
      profileSources: snapshot.profileSources && typeof snapshot.profileSources === "object" ? snapshot.profileSources : { works: "", comments: "", statements: "" },
      updatedAt: row.updated_at,
    };
  }

  function normalizeWorkspaceSnapshot(snapshot = {}) {
    const replyItems = Array.isArray(snapshot.replies) ? snapshot.replies.slice(0, 12).map((reply) => ({
      style: cleanText(reply?.style, 80),
      text: cleanText(reply?.text, 2000),
      rationale: cleanText(reply?.rationale, 500),
    })).filter((reply) => reply.text) : [];
    const workspace = {
      coreDecision: sanitizeAuditValue(snapshot.coreDecision) || null,
      algorithmCore: sanitizeAuditValue(snapshot.algorithmCore) || null,
      runtimeAnalysis: sanitizeAuditValue(snapshot.runtimeAnalysis) || null,
      runtimeIntake: sanitizeAuditValue(snapshot.runtimeIntake) || null,
      runtime: sanitizeAuditValue(snapshot.runtime) || null,
      openingTopics: Array.isArray(snapshot.openingTopics) ? snapshot.openingTopics.slice(0, 8).map((item) => cleanText(item, 240)).filter(Boolean) : [],
      liveInvite: sanitizeAuditValue(snapshot.liveInvite) || null,
      replyStyle: normalizeReplyStyle(snapshot.replyStyle),
      profileSources: {
        works: cleanText(snapshot.profileSources?.works, 6000),
        comments: cleanText(snapshot.profileSources?.comments, 6000),
        statements: cleanText(snapshot.profileSources?.statements, 6000),
      },
      savedAt: nowIso(),
    };
    return {
      latestDraft: cleanText(snapshot.latestDraft, 2000),
      replies: replyItems,
      profile: sanitizeAuditValue(snapshot.profile) || null,
      workspace,
    };
  }

  function saveWorkspaceSnapshot({ actor, brotherId, snapshot } = {}) {
    const current = actorRow(actor);
    const brother = chatBrotherForActor(brotherId, current);
    if (current.role !== "anchor" || brother.owner_user_id !== current.id) throw new Error("WORKSPACE_WRITE_DENIED");
    const normalized = normalizeWorkspaceSnapshot(snapshot);
    const timestamp = nowIso();
    db.prepare(`INSERT INTO workspace_snapshots (brother_id, owner_user_id, snapshot_json, latest_draft, latest_ai_candidates_json, profile_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(brother_id) DO UPDATE SET owner_user_id = excluded.owner_user_id, snapshot_json = excluded.snapshot_json, latest_draft = excluded.latest_draft, latest_ai_candidates_json = excluded.latest_ai_candidates_json, profile_json = excluded.profile_json, updated_at = excluded.updated_at`)
      .run(brother.id, current.id, JSON.stringify(normalized.workspace).slice(0, 12000), normalized.latestDraft, JSON.stringify(normalized.replies).slice(0, 24000), JSON.stringify(normalized.profile || {}).slice(0, 12000), timestamp, timestamp);
    audit({ actorUserId: current.id, action: "chat.workspace.snapshot", metadata: { brotherId: brother.id, candidateCount: normalized.replies.length, hasDraft: Boolean(normalized.latestDraft) } });
    return mapWorkspaceSnapshot(db.prepare("SELECT * FROM workspace_snapshots WHERE brother_id = ?").get(brother.id));
  }

  function saveReplyHistory({ actor, brotherId, sourceMessageId = "", currentMessage = "", replyStyle = "balanced", replies = [], profile = null, coreDecision = null, algorithmCore = null } = {}) {
    const current = actorRow(actor);
    const brother = chatBrotherForActor(brotherId, current);
    if (current.role !== "anchor" || brother.owner_user_id !== current.id) throw new Error("REPLY_HISTORY_WRITE_DENIED");
    const replyItems = Array.isArray(replies) ? replies.slice(0, 12).map((reply) => ({
      style: cleanText(reply?.style, 80),
      text: cleanText(reply?.text, 2000),
      rationale: cleanText(reply?.rationale, 500),
    })).filter((reply) => reply.text) : [];
    if (!replyItems.length) throw new Error("REPLY_HISTORY_INVALID");
    const timestamp = nowIso();
    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO reply_history
      (id, brother_id, owner_user_id, operator_id, source_message_id, current_message, reply_style, replies_json, profile_json, core_decision_json, algorithm_core_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        id,
        brother.id,
        brother.owner_user_id,
        brother.operator_id || null,
        cleanText(sourceMessageId, 120) || null,
        cleanText(currentMessage, 2000),
        normalizeReplyStyle(replyStyle),
        JSON.stringify(replyItems).slice(0, 24000),
        JSON.stringify(sanitizeAuditValue(profile) || {}).slice(0, 12000),
        JSON.stringify(sanitizeAuditValue(coreDecision) || {}).slice(0, 6000),
        JSON.stringify(sanitizeAuditValue(algorithmCore) || {}).slice(0, 12000),
        timestamp,
      );
    audit({ actorUserId: current.id, action: "chat.reply.history.create", metadata: { brotherId: brother.id, historyId: id, candidateCount: replyItems.length, replyStyle: normalizeReplyStyle(replyStyle) } });
    return mapReplyHistory(db.prepare("SELECT * FROM reply_history WHERE id = ?").get(id));
  }

  function listReplyHistory({ actor, brotherId, limit = 30 } = {}) {
    const current = actorRow(actor);
    const brother = chatBrotherForActor(brotherId, current);
    const boundedLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 30, 100));
    const rows = db.prepare("SELECT * FROM reply_history WHERE brother_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?").all(brother.id, boundedLimit);
    return { items: rows.map(mapReplyHistory) };
  }

  function listWorkspaceSnapshots({ actor, brotherId, limit = 200 } = {}) {
    const brother = chatBrotherForActor(brotherId, actor);
    const boundedLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 200, 500));
    return db.prepare("SELECT * FROM workspace_snapshots WHERE brother_id = ? ORDER BY updated_at DESC LIMIT ?").all(brother.id, boundedLimit).map(mapWorkspaceSnapshot);
  }

  function listReadonlyWorkspace({ actor, anchorId } = {}) {
    const current = actorRow(actor);
    if (!["operator", "super_admin"].includes(current.role)) throw new Error("WORKSPACE_READ_DENIED");
    const anchor = getUserById.get(cleanText(anchorId, 120));
    if (!anchor || anchor.role !== "anchor") throw new Error("ANCHOR_NOT_FOUND");
    if (current.role === "operator" && anchor.operator_id !== current.id) throw new Error("WORKSPACE_READ_DENIED");
    const brothers = db.prepare(`SELECT b.*, (SELECT COUNT(*) FROM chat_messages m WHERE m.brother_id = b.id) AS message_count, (SELECT MAX(m.created_at) FROM chat_messages m WHERE m.brother_id = b.id) AS latest_message_at FROM chat_brothers b WHERE b.owner_user_id = ? ORDER BY b.updated_at DESC, b.created_at DESC, b.client_id DESC, b.id DESC`).all(anchor.id);
    const messageQuery = db.prepare("SELECT * FROM chat_messages WHERE brother_id = ? ORDER BY created_at ASC LIMIT 2000");
    const snapshotQuery = db.prepare("SELECT * FROM workspace_snapshots WHERE brother_id = ?");
    const replyHistoryQuery = db.prepare("SELECT * FROM reply_history WHERE brother_id = ? ORDER BY created_at DESC LIMIT 100");
    return {
      anchor: { id: anchor.id, name: anchor.name, role: anchor.role, status: anchor.status, phone: maskPhone(anchor.phone), operatorId: anchor.operator_id || null },
      brothers: brothers.map((brother) => ({ ...mapBrother(brother), messages: messageQuery.all(brother.id).map(mapChatMessage), workspace: mapWorkspaceSnapshot(snapshotQuery.get(brother.id)), replyHistory: replyHistoryQuery.all(brother.id).map(mapReplyHistory) })),
    };
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

  function listAuditLogs({ actor, actorUserId, actorFilterId = "", limit = 50, cursor = "", action = "", role = "", from = "", to = "" } = {}) {
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
      conditions.push("(l.actor_user_id = ? OR actor.operator_id = ? OR target.operator_id = ? OR json_extract(l.actor_snapshot_json, '$.operatorId') = ? OR json_extract(l.target_snapshot_json, '$.operatorId') = ?)");
      params.push(active.id, active.id, active.id, active.id, active.id);
    }
    const requestedActorId = cleanText(actorFilterId, 120);
    if (requestedActorId) {
      conditions.push("(l.actor_user_id = ? OR json_extract(l.actor_snapshot_json, '$.id') = ?)");
      params.push(requestedActorId, requestedActorId);
    }
    if (actionFilter) {
      conditions.push("l.action = ?");
      params.push(actionFilter);
    }
    if (roleFilter) {
      conditions.push("(actor.role = ? OR target.role = ? OR json_extract(l.actor_snapshot_json, '$.role') = ? OR json_extract(l.target_snapshot_json, '$.role') = ?)");
      params.push(roleFilter, roleFilter, roleFilter, roleFilter);
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
    const query = `SELECT l.id, l.actor_user_id as actorId, l.action, l.target_user_id as targetId, l.metadata,
      l.actor_snapshot_json as actorSnapshot, l.target_snapshot_json as targetSnapshot, l.created_at as createdAt,
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
      const actorSnapshot = parseAuditSnapshot(row.actorSnapshot);
      const targetSnapshot = parseAuditSnapshot(row.targetSnapshot);
      const actorInfo = row.actorId
        ? { id: row.actorId, name: row.actorName, role: row.actorRole, phone: maskPhone(row.actorPhone) }
        : (actorSnapshot ? { id: actorSnapshot.id, name: actorSnapshot.name, role: actorSnapshot.role, phone: actorSnapshot.phone || "****", status: actorSnapshot.status || null } : null);
      const targetInfo = row.targetId
        ? { id: row.targetId, name: row.targetName, role: row.targetRole, phone: maskPhone(row.targetPhone) }
        : (targetSnapshot ? { id: targetSnapshot.id, name: targetSnapshot.name, role: targetSnapshot.role, phone: targetSnapshot.phone || "****", status: targetSnapshot.status || null } : null);
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

  function listAllAuditItems(actor) {
    const items = [];
    let cursor = "";
    do {
      const page = listAuditLogs({ actor, limit: 100, cursor });
      items.push(...page.items);
      cursor = page.nextCursor || "";
    } while (cursor && items.length < 5000);
    return items;
  }

  function listAuditActors({ actor, role = "", query = "" } = {}) {
    const active = actorRow(actor);
    if (!["operator", "super_admin"].includes(active.role)) throw new Error("AUDIT_ACCESS_DENIED");
    const roleFilter = cleanText(role, 40);
    if (roleFilter && !ROLES.has(roleFilter)) throw new Error("AUDIT_QUERY_INVALID");
    const search = cleanText(query, 80).toLowerCase();
    const groups = new Map();
    for (const item of listAllAuditItems(active)) {
      const actorInfo = item.actor;
      if (!actorInfo || (roleFilter && actorInfo.role !== roleFilter)) continue;
      if (search && !`${actorInfo.name || ""} ${actorInfo.id || ""}`.toLowerCase().includes(search)) continue;
      const existing = groups.get(actorInfo.id) || {
        actor: actorInfo,
        eventCount: 0,
        messageCount: 0,
        lastActionAt: null,
        lastAction: null,
      };
      existing.eventCount += 1;
      if (item.chatMessage) existing.messageCount += 1;
      if (!existing.lastActionAt || item.createdAt > existing.lastActionAt) {
        existing.lastActionAt = item.createdAt;
        existing.lastAction = item.action;
      }
      groups.set(actorInfo.id, existing);
    }
    return {
      items: [...groups.values()].sort((left, right) => String(right.lastActionAt || "").localeCompare(String(left.lastActionAt || ""))),
    };
  }

  function listAuditActorLogs({ actor, actorId, limit = 50, cursor = "" } = {}) {
    const active = actorRow(actor);
    if (!["operator", "super_admin"].includes(active.role)) throw new Error("AUDIT_ACCESS_DENIED");
    const requestedActorId = cleanText(actorId, 120);
    if (!requestedActorId) throw new Error("AUDIT_QUERY_INVALID");
    return listAuditLogs({ actor: active, actorFilterId: requestedActorId, limit, cursor });
  }

  const RUNTIME_MEMORY_SCOPES = new Set(["user", "object", "relationship", "event", "hypothesis"]);
  const RUNTIME_MEMORY_SOURCE_TYPES = new Set(["user_explicit", "user_report", "chatlab", "tool", "assistant_inference"]);
  const RUNTIME_MEMORY_CONFIDENCE = new Set(["high", "medium", "low"]);

  function runtimeMemoryContext({ actor, brotherId, write = false } = {}) {
    const current = actorRow(actor);
    const brother = chatBrotherForActor(brotherId, current);
    if (write && (current.role !== "anchor" || brother.owner_user_id !== current.id)) throw new Error("RUNTIME_MEMORY_WRITE_DENIED");
    return {
      current,
      brother,
      ownerUserId: brother.owner_user_id,
      namespace: `${brother.owner_user_id}:${brother.id}`,
    };
  }

  function ensureRuntimeMemoryNamespace({ actor, brotherId } = {}) {
    const context = runtimeMemoryContext({ actor, brotherId });
    const existing = db.prepare("SELECT * FROM goutoujunshi_memory_settings WHERE owner_user_id = ? AND brother_id = ?").get(context.ownerUserId, context.brother.id);
    if (!existing) {
      db.prepare("INSERT INTO goutoujunshi_memory_settings (owner_user_id, brother_id, updated_at) VALUES (?, ?, ?)").run(context.ownerUserId, context.brother.id, nowIso());
    }
    return context;
  }

  function mapRuntimeMemory(row) {
    if (!row) return null;
    return {
      id: row.id,
      ownerUserId: row.owner_user_id,
      brotherId: row.brother_id,
      scope: row.scope,
      field: row.field,
      value: row.value,
      sourceType: row.source_type,
      sourceRef: row.source_ref || "",
      occurredAt: row.occurred_at || null,
      confidence: row.confidence,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function mapRuntimeMemoryStatus(row, context) {
    return {
      namespace: context.namespace,
      ownerUserId: context.ownerUserId,
      brotherId: context.brother.id,
      consentEnabled: Boolean(Number(row?.consent_enabled || 0)),
      paused: Boolean(Number(row?.paused || 0)),
      consentAt: row?.consent_at || null,
      updatedAt: row?.updated_at || null,
    };
  }

  function getRuntimeMemoryStatus({ actor, brotherId } = {}) {
    const context = ensureRuntimeMemoryNamespace({ actor, brotherId });
    const row = db.prepare("SELECT * FROM goutoujunshi_memory_settings WHERE owner_user_id = ? AND brother_id = ?").get(context.ownerUserId, context.brother.id);
    return mapRuntimeMemoryStatus(row, context);
  }

  function runtimeMemoryWriteContext({ actor, brotherId } = {}) {
    const context = runtimeMemoryContext({ actor, brotherId, write: true });
    ensureRuntimeMemoryNamespace({ actor, brotherId });
    const setting = db.prepare("SELECT * FROM goutoujunshi_memory_settings WHERE owner_user_id = ? AND brother_id = ?").get(context.ownerUserId, context.brother.id);
    return { context, setting };
  }

  function enableRuntimeMemory({ actor, brotherId } = {}) {
    const { context } = runtimeMemoryWriteContext({ actor, brotherId });
    const timestamp = nowIso();
    db.prepare("UPDATE goutoujunshi_memory_settings SET consent_enabled = 1, paused = 0, consent_at = COALESCE(consent_at, ?), updated_at = ? WHERE owner_user_id = ? AND brother_id = ?")
      .run(timestamp, timestamp, context.ownerUserId, context.brother.id);
    audit({ actorUserId: context.current.id, action: "chat.runtime.memory.enable", metadata: { brotherId: context.brother.id } });
    return getRuntimeMemoryStatus({ actor: context.current, brotherId: context.brother.id });
  }

  function pauseRuntimeMemory({ actor, brotherId } = {}) {
    const { context, setting } = runtimeMemoryWriteContext({ actor, brotherId });
    if (!Number(setting?.consent_enabled)) throw new Error("CONSENT_REQUIRED");
    const timestamp = nowIso();
    db.prepare("UPDATE goutoujunshi_memory_settings SET paused = 1, updated_at = ? WHERE owner_user_id = ? AND brother_id = ?").run(timestamp, context.ownerUserId, context.brother.id);
    audit({ actorUserId: context.current.id, action: "chat.runtime.memory.pause", metadata: { brotherId: context.brother.id } });
    return getRuntimeMemoryStatus({ actor: context.current, brotherId: context.brother.id });
  }

  function resumeRuntimeMemory({ actor, brotherId } = {}) {
    const { context, setting } = runtimeMemoryWriteContext({ actor, brotherId });
    if (!Number(setting?.consent_enabled)) throw new Error("CONSENT_REQUIRED");
    const timestamp = nowIso();
    db.prepare("UPDATE goutoujunshi_memory_settings SET paused = 0, updated_at = ? WHERE owner_user_id = ? AND brother_id = ?").run(timestamp, context.ownerUserId, context.brother.id);
    audit({ actorUserId: context.current.id, action: "chat.runtime.memory.resume", metadata: { brotherId: context.brother.id } });
    return getRuntimeMemoryStatus({ actor: context.current, brotherId: context.brother.id });
  }

  function normalizeRuntimeMemoryDelta(raw = {}) {
    const scope = cleanText(raw.scope, 32);
    const field = cleanText(raw.field, 64);
    const value = cleanText(raw.value, 200);
    const sourceType = cleanText(raw.sourceType || raw.source_type, 32);
    const sourceRef = cleanText(raw.sourceRef || raw.source_ref, 200);
    const occurredAt = cleanText(raw.occurredAt || raw.occurred_at, 64);
    const confidence = cleanText(raw.confidence || "medium", 16);
    if (!RUNTIME_MEMORY_SCOPES.has(scope) || !field || !value || !RUNTIME_MEMORY_SOURCE_TYPES.has(sourceType) || !RUNTIME_MEMORY_CONFIDENCE.has(confidence)) throw new Error("INVALID_RUNTIME_MEMORY_DELTA");
    if (scope === "user" && sourceType !== "user_explicit") throw new Error("SOURCE_NOT_ELIGIBLE");
    if (["object", "relationship"].includes(scope) && !["user_explicit", "user_report"].includes(sourceType)) throw new Error("SOURCE_NOT_ELIGIBLE");
    if (sourceType === "assistant_inference" && scope !== "hypothesis") throw new Error("SOURCE_NOT_ELIGIBLE");
    if (occurredAt && Number.isNaN(Date.parse(occurredAt))) throw new Error("INVALID_RUNTIME_MEMORY_DELTA");
    return { scope, field, value, sourceType, sourceRef, occurredAt: occurredAt ? new Date(occurredAt).toISOString() : null, confidence };
  }

  function listRuntimeMemory({ actor, brotherId, limit = 200 } = {}) {
    const context = ensureRuntimeMemoryNamespace({ actor, brotherId });
    const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 200, 200));
    const rows = db.prepare("SELECT * FROM goutoujunshi_memories WHERE owner_user_id = ? AND brother_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT ?").all(context.ownerUserId, context.brother.id, safeLimit);
    return { status: getRuntimeMemoryStatus({ actor: context.current, brotherId: context.brother.id }), items: rows.map(mapRuntimeMemory) };
  }

  function applyRuntimeMemoryDelta({ actor, brotherId, delta } = {}) {
    const { context, setting } = runtimeMemoryWriteContext({ actor, brotherId });
    if (!Number(setting?.consent_enabled)) throw new Error("CONSENT_REQUIRED");
    if (Number(setting?.paused)) throw new Error("MEMORY_PAUSED");
    const normalized = normalizeRuntimeMemoryDelta(delta);
    const existing = db.prepare("SELECT * FROM goutoujunshi_memories WHERE owner_user_id = ? AND brother_id = ? AND scope = ? AND field = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1")
      .get(context.ownerUserId, context.brother.id, normalized.scope, normalized.field);
    if (!existing && Number(db.prepare("SELECT COUNT(*) AS count FROM goutoujunshi_memories WHERE owner_user_id = ? AND brother_id = ? AND status = 'active'").get(context.ownerUserId, context.brother.id).count) >= 200) throw new Error("MEMORY_LIMIT_REACHED");
    const timestamp = nowIso();
    const id = existing?.id || crypto.randomUUID();
    const next = {
      id,
      owner_user_id: context.ownerUserId,
      brother_id: context.brother.id,
      scope: normalized.scope,
      field: normalized.field,
      value: normalized.value,
      source_type: normalized.sourceType,
      source_ref: normalized.sourceRef,
      occurred_at: normalized.occurredAt,
      confidence: normalized.confidence,
      status: "active",
      created_at: existing?.created_at || timestamp,
      updated_at: timestamp,
    };
    const before = existing ? mapRuntimeMemory(existing) : null;
    const after = mapRuntimeMemory(next);
    db.transaction(() => {
      if (existing) {
        db.prepare("UPDATE goutoujunshi_memories SET value = ?, source_type = ?, source_ref = ?, occurred_at = ?, confidence = ?, updated_at = ? WHERE id = ?")
          .run(next.value, next.source_type, next.source_ref, next.occurred_at, next.confidence, next.updated_at, id);
      } else {
        db.prepare("INSERT INTO goutoujunshi_memories (id, owner_user_id, brother_id, scope, field, value, source_type, source_ref, occurred_at, confidence, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .run(next.id, next.owner_user_id, next.brother_id, next.scope, next.field, next.value, next.source_type, next.source_ref, next.occurred_at, next.confidence, next.status, next.created_at, next.updated_at);
      }
      db.prepare("INSERT INTO goutoujunshi_memory_operations (op_id, owner_user_id, brother_id, action, before_json, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(crypto.randomUUID(), context.ownerUserId, context.brother.id, "apply", JSON.stringify(before), JSON.stringify(after), timestamp);
      db.prepare("DELETE FROM goutoujunshi_memory_operations WHERE owner_user_id = ? AND brother_id = ? AND op_id NOT IN (SELECT op_id FROM goutoujunshi_memory_operations WHERE owner_user_id = ? AND brother_id = ? ORDER BY created_at DESC LIMIT 20)")
        .run(context.ownerUserId, context.brother.id, context.ownerUserId, context.brother.id);
    })();
    audit({ actorUserId: context.current.id, action: "chat.runtime.memory.apply", metadata: { brotherId: context.brother.id, scope: normalized.scope, field: normalized.field } });
    return after;
  }

  function undoRuntimeMemory({ actor, brotherId } = {}) {
    const { context } = runtimeMemoryWriteContext({ actor, brotherId });
    const operation = db.prepare("SELECT * FROM goutoujunshi_memory_operations WHERE owner_user_id = ? AND brother_id = ? ORDER BY created_at DESC LIMIT 1").get(context.ownerUserId, context.brother.id);
    if (!operation) throw new Error("MEMORY_UNDO_EMPTY");
    let before = null;
    try { before = JSON.parse(operation.before_json || "null"); } catch { before = null; }
    db.transaction(() => {
      const after = (() => { try { return JSON.parse(operation.after_json || "null"); } catch { return null; } })();
      if (before) {
        db.prepare("INSERT INTO goutoujunshi_memories (id, owner_user_id, brother_id, scope, field, value, source_type, source_ref, occurred_at, confidence, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value, source_type = excluded.source_type, source_ref = excluded.source_ref, occurred_at = excluded.occurred_at, confidence = excluded.confidence, status = excluded.status, updated_at = excluded.updated_at")
          .run(before.id, before.ownerUserId, before.brotherId, before.scope, before.field, before.value, before.sourceType, before.sourceRef || "", before.occurredAt, before.confidence, before.status || "active", before.createdAt, nowIso());
      } else if (after?.id) {
        db.prepare("DELETE FROM goutoujunshi_memories WHERE id = ? AND owner_user_id = ? AND brother_id = ?").run(after.id, context.ownerUserId, context.brother.id);
      }
      db.prepare("DELETE FROM goutoujunshi_memory_operations WHERE op_id = ?").run(operation.op_id);
    })();
    audit({ actorUserId: context.current.id, action: "chat.runtime.memory.undo", metadata: { brotherId: context.brother.id } });
    return { ok: true, status: getRuntimeMemoryStatus({ actor: context.current, brotherId: context.brother.id }) };
  }

  function forgetRuntimeMemoryObject({ actor, brotherId } = {}) {
    const { context } = runtimeMemoryWriteContext({ actor, brotherId });
    db.transaction(() => {
      db.prepare("DELETE FROM goutoujunshi_memories WHERE owner_user_id = ? AND brother_id = ?").run(context.ownerUserId, context.brother.id);
      db.prepare("DELETE FROM goutoujunshi_memory_operations WHERE owner_user_id = ? AND brother_id = ?").run(context.ownerUserId, context.brother.id);
    })();
    audit({ actorUserId: context.current.id, action: "chat.runtime.memory.forget", metadata: { brotherId: context.brother.id } });
    return { ok: true, status: getRuntimeMemoryStatus({ actor: context.current, brotherId: context.brother.id }) };
  }

  function revokeRuntimeMemory({ actor, brotherId } = {}) {
    const { context } = runtimeMemoryWriteContext({ actor, brotherId });
    db.transaction(() => {
      db.prepare("DELETE FROM goutoujunshi_memories WHERE owner_user_id = ? AND brother_id = ?").run(context.ownerUserId, context.brother.id);
      db.prepare("DELETE FROM goutoujunshi_memory_operations WHERE owner_user_id = ? AND brother_id = ?").run(context.ownerUserId, context.brother.id);
      db.prepare("DELETE FROM goutoujunshi_memory_settings WHERE owner_user_id = ? AND brother_id = ?").run(context.ownerUserId, context.brother.id);
    })();
    audit({ actorUserId: context.current.id, action: "chat.runtime.memory.revoke", metadata: { brotherId: context.brother.id } });
    return { ok: true, status: getRuntimeMemoryStatus({ actor: context.current, brotherId: context.brother.id }) };
  }

  function clearRuntimeMemory({ actor } = {}) {
    const current = actorRow(actor);
    if (current.role !== "anchor") throw new Error("RUNTIME_MEMORY_WRITE_DENIED");
    db.transaction(() => {
      db.prepare("DELETE FROM goutoujunshi_memories WHERE owner_user_id = ?").run(current.id);
      db.prepare("DELETE FROM goutoujunshi_memory_operations WHERE owner_user_id = ?").run(current.id);
      db.prepare("UPDATE goutoujunshi_memory_settings SET consent_enabled = 0, paused = 0, updated_at = ? WHERE owner_user_id = ?").run(nowIso(), current.id);
    })();
    audit({ actorUserId: current.id, action: "chat.runtime.memory.clear", metadata: {} });
    return { ok: true };
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
    listPendingAnchorsForApprover,
    approveAnchor,
    rejectAnchor,
    listAnchorsForOperator,
    listUserUsage,
    changeUserStatus,
    prepareUserDeletion,
    confirmUserDeletion,
    createChatBrother,
    listChatBrothers,
    appendChatMessage,
    editChatMessage,
    listChatMessages,
    searchChat,
    setChatMessageMark,
    createRelationshipEvent,
    listRelationshipEvents,
    createOperatorNote,
    listOperatorNotes,
    listMaintenanceTasks,
    updateMaintenanceTask,
    saveWorkspaceSnapshot,
    listWorkspaceSnapshots,
    saveReplyHistory,
    listReplyHistory,
    listReadonlyWorkspace,
    getOperatorOverview,
    listAuditLogs,
    listAuditActors,
    listAuditActorLogs,
    ensureRuntimeMemoryNamespace,
    getRuntimeMemoryStatus,
    enableRuntimeMemory,
    pauseRuntimeMemory,
    resumeRuntimeMemory,
    listRuntimeMemory,
    applyRuntimeMemoryDelta,
    undoRuntimeMemory,
    forgetRuntimeMemoryObject,
    revokeRuntimeMemory,
    clearRuntimeMemory,
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
