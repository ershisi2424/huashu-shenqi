const crypto = require("node:crypto");

const MIGRATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

// This migration represents the schema that createAuthStore currently builds
// before the ledger is initialized. Existing databases are therefore adopted
// at this point; future schema changes must be added as new entries below this
// baseline instead of as untracked ALTER TABLE calls.
const AUTH_SCHEMA_BASELINE = Object.freeze({
  id: "0001.auth-store-baseline",
  description: "Current auth/chat SQLite schema baseline",
  sql: "",
});

const PASSWORD_RESET_TOKENS = Object.freeze({
  id: "0002.password-reset-tokens",
  description: "One-time administrator-issued password reset token records",
  sql: `
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_hash TEXT PRIMARY KEY,
      target_user_id TEXT NOT NULL,
      actor_user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      used_at INTEGER,
      FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expiry ON password_reset_tokens(expires_at);
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_target ON password_reset_tokens(target_user_id, created_at DESC);
  `,
});

const REPLY_HISTORY_RUNTIME_CONTEXT = Object.freeze({
  id: "0003.reply-history-runtime-context",
  description: "Persist Runtime context alongside reply candidate history",
  sql: `
    ALTER TABLE reply_history ADD COLUMN runtime_analysis_json TEXT NOT NULL DEFAULT '{}';
    ALTER TABLE reply_history ADD COLUMN runtime_intake_json TEXT NOT NULL DEFAULT '{}';
    ALTER TABLE reply_history ADD COLUMN runtime_json TEXT NOT NULL DEFAULT '{}';
    ALTER TABLE reply_history ADD COLUMN opening_topics_json TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE reply_history ADD COLUMN live_invite_json TEXT NOT NULL DEFAULT 'null';
  `,
});

function migrationChecksum(migration) {
  if (!migration || typeof migration !== "object") throw new Error("MIGRATION_INVALID");
  const id = typeof migration.id === "string" ? migration.id : "";
  const description = typeof migration.description === "string" ? migration.description : "";
  const sql = typeof migration.sql === "string" ? migration.sql : "";
  const declared = typeof migration.checksum === "string" ? migration.checksum.trim().toLowerCase() : "";
  if (declared) {
    if (!/^[a-f0-9]{64}$/.test(declared)) throw new Error("MIGRATION_CHECKSUM_INVALID");
    return declared;
  }
  return crypto.createHash("sha256").update(`${id}\n${description}\n${sql}`, "utf8").digest("hex");
}

function normalizeMigration(migration) {
  if (!migration || typeof migration !== "object" || typeof migration.id !== "string" || !MIGRATION_ID_PATTERN.test(migration.id)) {
    throw new Error("MIGRATION_INVALID");
  }
  const description = typeof migration.description === "string" ? migration.description.trim().slice(0, 240) : "";
  if (!description) throw new Error("MIGRATION_DESCRIPTION_REQUIRED");
  if (migration.up !== undefined && typeof migration.up !== "function") throw new Error("MIGRATION_UP_INVALID");
  if (migration.sql !== undefined && typeof migration.sql !== "string") throw new Error("MIGRATION_SQL_INVALID");
  return {
    id: migration.id,
    description,
    sql: typeof migration.sql === "string" ? migration.sql : "",
    up: typeof migration.up === "function" ? migration.up : null,
    checksum: migrationChecksum(migration),
  };
}

function ensureMigrationTable(db) {
  if (!db || typeof db.exec !== "function") throw new Error("MIGRATION_DATABASE_REQUIRED");
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      execution_ms INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied ON schema_migrations(applied_at, id);
  `);
}

function nowIso() {
  return new Date().toISOString();
}

function applyMigrations(db, migrations = [], { now = nowIso } = {}) {
  ensureMigrationTable(db);
  if (!Array.isArray(migrations)) throw new Error("MIGRATIONS_INVALID");
  const normalized = migrations.map(normalizeMigration);
  const seen = new Set();
  for (const migration of normalized) {
    if (seen.has(migration.id)) throw new Error("MIGRATION_DUPLICATE");
    seen.add(migration.id);
  }
  const getExisting = db.prepare("SELECT id, checksum FROM schema_migrations WHERE id = ?");
  const insert = db.prepare("INSERT INTO schema_migrations (id, checksum, description, applied_at, execution_ms) VALUES (?, ?, ?, ?, ?)");
  for (const migration of normalized) {
    const existing = getExisting.get(migration.id);
    if (existing) {
      if (existing.checksum !== migration.checksum) throw new Error("MIGRATION_CHECKSUM_MISMATCH");
      continue;
    }
    const startedAt = Date.now();
    const run = db.transaction(() => {
      if (migration.up) migration.up(db);
      else if (migration.sql.trim()) db.exec(migration.sql);
      insert.run(migration.id, migration.checksum, migration.description, now(), Date.now() - startedAt);
    });
    run();
  }
  return getMigrationLedger(db);
}

function getMigrationLedger(db) {
  ensureMigrationTable(db);
  return db.prepare("SELECT id, checksum, description, applied_at AS appliedAt, execution_ms AS executionMs FROM schema_migrations ORDER BY applied_at ASC, id ASC").all();
}

function assertMigrationLedger(db, migrations = []) {
  const expected = new Map(migrations.map((migration) => {
    const normalized = normalizeMigration(migration);
    return [normalized.id, normalized.checksum];
  }));
  for (const row of getMigrationLedger(db)) {
    if (expected.has(row.id) && expected.get(row.id) !== row.checksum) throw new Error("MIGRATION_CHECKSUM_MISMATCH");
  }
  return true;
}

module.exports = {
  AUTH_SCHEMA_BASELINE,
  PASSWORD_RESET_TOKENS,
  REPLY_HISTORY_RUNTIME_CONTEXT,
  applyMigrations,
  assertMigrationLedger,
  ensureMigrationTable,
  getMigrationLedger,
  migrationChecksum,
};
