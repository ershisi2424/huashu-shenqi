const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

const { createAuthStore } = require("./lib/auth-store.cjs");
const {
  AUTH_SCHEMA_BASELINE,
  PASSWORD_RESET_TOKENS,
  REPLY_HISTORY_RUNTIME_CONTEXT,
  applyMigrations,
  getMigrationLedger,
  migrationChecksum,
} = require("./lib/db-migrations.cjs");
const { backupDatabase, verifyDatabase } = require("./lib/db-backup.cjs");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-db-stage-"));
const dbPath = path.join(root, "auth.sqlite");
const backupPath = path.join(root, "backup", "auth.sqlite");

// Auth store initialization must create and record a deterministic baseline.
const store = createAuthStore({ filename: dbPath });
const inspect = new Database(dbPath, { readonly: true, fileMustExist: true });
const ledger = getMigrationLedger(inspect);
assert.equal(ledger.length, 3);
assert.equal(ledger[0].id, AUTH_SCHEMA_BASELINE.id);
assert.equal(ledger[0].checksum, migrationChecksum(AUTH_SCHEMA_BASELINE));
assert.equal(ledger[1].id, PASSWORD_RESET_TOKENS.id);
assert.equal(ledger[1].checksum, migrationChecksum(PASSWORD_RESET_TOKENS));
assert.equal(ledger[2].id, REPLY_HISTORY_RUNTIME_CONTEXT.id);
assert.equal(ledger[2].checksum, migrationChecksum(REPLY_HISTORY_RUNTIME_CONTEXT));
assert.equal(inspect.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
inspect.close();

// Reopening an existing database is idempotent and does not duplicate entries.
store.close();
const reopened = createAuthStore({ filename: dbPath });
reopened.close();
const reopenedDb = new Database(dbPath, { readonly: true, fileMustExist: true });
assert.equal(getMigrationLedger(reopenedDb).length, 3);
reopenedDb.close();

// A changed migration definition must stop startup instead of silently running
// a different migration under an already-applied id.
const mismatchDb = new Database(":memory:");
const migration = { id: "0002.test", description: "test migration", sql: "CREATE TABLE sample (id TEXT PRIMARY KEY)" };
applyMigrations(mismatchDb, [migration]);
assert.throws(() => applyMigrations(mismatchDb, [{ ...migration, sql: "CREATE TABLE sample (id TEXT PRIMARY KEY, note TEXT)" }]), /MIGRATION_CHECKSUM_MISMATCH/);
mismatchDb.close();

// Backups must be SQLite-consistent, refuse overwrite-by-default, and expose
// only structural/integrity metadata to callers.
const beforeHash = require("node:crypto").createHash("sha256").update(fs.readFileSync(dbPath)).digest("hex");
(async () => {
  const result = await backupDatabase({ source: dbPath, destination: backupPath });
  assert.equal(result.verified, true);
  assert.equal(result.integrity, "ok");
  assert.equal(result.migrationCount, 3);
  assert.equal(verifyDatabase(backupPath).integrity, "ok");
  await assert.rejects(() => backupDatabase({ source: dbPath, destination: backupPath }), /BACKUP_DESTINATION_EXISTS/);
  const afterHash = require("node:crypto").createHash("sha256").update(fs.readFileSync(dbPath)).digest("hex");
  assert.equal(afterHash, beforeHash, "backup must not modify source database");
  fs.rmSync(root, { recursive: true, force: true });
  console.log("test-db-migrations-backup: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
