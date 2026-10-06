#!/usr/bin/env node

const { restoreToCandidate } = require("../lib/db-recovery.cjs");

function parseArgs(argv) {
  const output = { source: "", destination: "" };
  const args = [...argv];
  while (args.length) {
    const arg = args.shift();
    if (arg === "--source") { output.source = args.shift() || ""; continue; }
    if (arg === "--destination") { output.destination = args.shift() || ""; continue; }
    throw new Error("RESTORE_ARGUMENT_INVALID");
  }
  if (!output.source || !output.destination) throw new Error("RESTORE_PATH_REQUIRED");
  return output;
}

(async () => {
  try {
    const input = parseArgs(process.argv.slice(2));
    const result = await restoreToCandidate({ source: input.source, candidate: input.destination });
    console.log(JSON.stringify({
      verified: result.verified,
      integrity: result.integrity,
      migrationCount: result.migrationCount,
      latestMigration: result.latestMigration,
    }));
  } catch (error) {
    const message = String(error?.message || "RESTORE_FAILED");
    const safeCode = /^[A-Z0-9_]+$/.test(message) ? message : "RESTORE_FAILED";
    console.error(`数据库恢复演练失败：${safeCode}`);
    process.exitCode = 1;
  }
})();
