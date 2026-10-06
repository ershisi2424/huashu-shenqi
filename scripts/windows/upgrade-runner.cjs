const fs = require("node:fs");
const { commitUpgrade, executeCandidateMigration, recoverUpgrade } = require("../../lib/windows-upgrade-state.cjs");

function args(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) throw new Error("UPGRADE_ARGUMENT_INVALID");
    output[key.slice(2)] = argv[++index] || "";
  }
  return output;
}

(async () => {
  try {
    const input = args(process.argv.slice(2));
    if (input.mode === "candidate") {
      const migrations = input.migrations ? JSON.parse(fs.readFileSync(input.migrations, "utf8")) : [];
      const result = await executeCandidateMigration({ productionDb: input.production, candidateDb: input.candidate, statePath: input.state, migrations });
      process.stdout.write(`${JSON.stringify({ phase: result.phase, migrationTarget: result.migrationTarget, reusable: result.reusable, productionDbMutatedBeforeCommit: result.productionDbMutatedBeforeCommit })}\n`);
      process.exitCode = result.phase === "failed" ? 1 : 0;
    } else if (input.mode === "commit") {
      const result = await commitUpgrade({ productionDb: input.production, candidateDb: input.candidate, pointerPath: input.pointer, version: input.version, statePath: input.state });
      process.stdout.write(`${JSON.stringify({ phase: result.phase, version: result.version, productionDbMutatedBeforeCommit: result.productionDbMutatedBeforeCommit })}\n`);
    } else if (input.mode === "recover") {
      process.stdout.write(`${JSON.stringify(recoverUpgrade({ statePath: input.state, productionDb: input.production, pointerPath: input.pointer }))}\n`);
    } else throw new Error("UPGRADE_MODE_INVALID");
  } catch (error) {
    console.error(/^[A-Z0-9_]+$/.test(String(error?.message || "")) ? error.message : "UPGRADE_FAILED");
    process.exitCode = 1;
  }
})().catch(() => { process.exitCode = 1; });
