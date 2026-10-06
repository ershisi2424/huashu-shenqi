#!/usr/bin/env node

const path = require("node:path");
const { backupDatabase } = require("../lib/db-backup.cjs");

function parseArgs(argv) {
  const output = { source: process.env.AUTH_DB_PATH || path.join(process.cwd(), "data", "auth.sqlite"), destination: "" };
  const args = [...argv];
  while (args.length) {
    const arg = args.shift();
    if (arg === "--source") { output.source = args.shift() || ""; continue; }
    if (arg === "--output") { output.destination = args.shift() || ""; continue; }
    throw new Error("BACKUP_ARGUMENT_INVALID");
  }
  if (!output.destination) throw new Error("BACKUP_DESTINATION_REQUIRED");
  return output;
}

(async () => {
  try {
    const result = await backupDatabase(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify({ verified: result.verified, integrity: result.integrity, migrationCount: result.migrationCount, latestMigration: result.latestMigration, sha256: result.sha256 }));
  } catch (error) {
    const message = String(error?.message || "BACKUP_FAILED");
    const safeCode = /^[A-Z0-9_]+$/.test(message) ? message : "BACKUP_FAILED";
    console.error(`数据库备份失败：${safeCode}`);
    process.exitCode = 1;
  }
})();
