const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const { verifyDatabase } = require("./db-backup.cjs");

function absolutePath(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}_REQUIRED`);
  return path.resolve(value);
}

function assertSource(source) {
  const stat = fs.statSync(source, { throwIfNoEntry: false });
  if (!stat?.isFile()) throw new Error("RESTORE_SOURCE_NOT_FOUND");
}

async function restoreDatabase({ source, destination } = {}) {
  const sourcePath = absolutePath(source, "RESTORE_SOURCE");
  const destinationPath = absolutePath(destination, "RESTORE_DESTINATION");
  assertSource(sourcePath);
  if (sourcePath === destinationPath) throw new Error("RESTORE_SOURCE_DESTINATION_SAME");
  if (fs.existsSync(destinationPath)) throw new Error("RESTORE_DESTINATION_EXISTS");

  // Validate the input before writing anything. The destination is always a
  // new file; this helper deliberately has no overwrite or production switch.
  const sourceVerification = verifyDatabase(sourcePath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  const db = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    await db.backup(destinationPath);
  } finally {
    db.close();
  }
  const verification = verifyDatabase(destinationPath);
  return {
    verified: verification.verified,
    integrity: verification.integrity,
    migrationCount: verification.migrationCount,
    latestMigration: verification.latestMigration,
    sourceMigrationCount: sourceVerification.migrationCount,
    destination: destinationPath,
  };
}

// Upgrade code must restore into a new candidate path. Production replacement
// is owned by windows-upgrade-state.cjs after integrity and migration checks.
async function restoreToCandidate({ source, candidate } = {}) {
  return restoreDatabase({ source, destination: candidate });
}

function verifyRestoredDatabase(databasePath) {
  return verifyDatabase(databasePath);
}

module.exports = { restoreDatabase, restoreToCandidate, verifyRestoredDatabase };
