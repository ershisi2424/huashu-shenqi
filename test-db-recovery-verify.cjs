const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

const { createAuthStore } = require("./lib/auth-store.cjs");
const { backupDatabase } = require("./lib/db-backup.cjs");
const { restoreDatabase, verifyRestoredDatabase } = require("./lib/db-recovery.cjs");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-db-recovery-"));
const source = path.join(root, "source.sqlite");
const backup = path.join(root, "backup.sqlite");
const restored = path.join(root, "restore", "auth.sqlite");

(async () => {
  const store = createAuthStore({ filename: source });
  const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "恢复演练管理员", password: "not-logged" });
  assert.ok(admin.id);
  store.close();

  const beforeHash = crypto.createHash("sha256").update(fs.readFileSync(source)).digest("hex");
  await backupDatabase({ source, destination: backup });
  const result = await restoreDatabase({ source: backup, destination: restored });
  assert.equal(result.verified, true);
  assert.equal(result.integrity, "ok");
  assert.equal(verifyRestoredDatabase(restored).integrity, "ok");

  const restoredDb = new Database(restored, { readonly: true, fileMustExist: true });
  assert.equal(restoredDb.prepare("SELECT COUNT(*) AS count FROM users WHERE id = ?").get(admin.id).count, 1);
  restoredDb.close();
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(source)).digest("hex"), beforeHash);
  await assert.rejects(() => restoreDatabase({ source: backup, destination: restored }), /RESTORE_DESTINATION_EXISTS/);
  fs.rmSync(root, { recursive: true, force: true });
  console.log("test-db-recovery-verify: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
