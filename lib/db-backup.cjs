const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const { getMigrationLedger } = require("./db-migrations.cjs");

function absolutePath(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}_REQUIRED`);
  return path.resolve(value);
}

function assertSourcePath(source) {
  const stat = fs.statSync(source, { throwIfNoEntry: false });
  if (!stat?.isFile()) throw new Error("BACKUP_SOURCE_NOT_FOUND");
}

function verifyDatabase(databasePath) {
  const filename = absolutePath(databasePath, "BACKUP_PATH");
  assertSourcePath(filename);
  const db = new Database(filename, { readonly: true, fileMustExist: true });
  try {
    const integrity = db.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") throw new Error("BACKUP_INTEGRITY_FAILED");
    const ledger = getMigrationLedger(db);
    return {
      verified: true,
      integrity: "ok",
      migrationCount: ledger.length,
      latestMigration: ledger.at(-1)?.id || null,
    };
  } finally {
    db.close();
  }
}

async function backupDatabase({ source, destination } = {}) {
  const sourcePath = absolutePath(source, "BACKUP_SOURCE");
  const destinationPath = absolutePath(destination, "BACKUP_DESTINATION");
  assertSourcePath(sourcePath);
  if (sourcePath === destinationPath) throw new Error("BACKUP_SOURCE_DESTINATION_SAME");
  if (fs.existsSync(destinationPath)) throw new Error("BACKUP_DESTINATION_EXISTS");
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  const db = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    await db.backup(destinationPath);
  } finally {
    db.close();
  }
  const verification = verifyDatabase(destinationPath);
  const digest = crypto.createHash("sha256").update(fs.readFileSync(destinationPath)).digest("hex");
  return { ...verification, destination: destinationPath, sha256: digest };
}

module.exports = { backupDatabase, verifyDatabase };
