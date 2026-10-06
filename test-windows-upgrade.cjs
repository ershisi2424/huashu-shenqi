const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

const {
  executeCandidateMigration,
  commitUpgrade,
  recoverUpgrade,
  sha256File,
} = require("./lib/windows-upgrade-state.cjs");

function createDb(file) {
  const db = new Database(file);
  db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT NOT NULL);");
  db.prepare("INSERT INTO items (value) VALUES (?)").run("before");
  db.close();
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-upgrade-"));
  const production = path.join(root, "auth.sqlite");
  const candidate = path.join(root, "candidate", "auth.sqlite");
  const statePath = path.join(root, "install-state.json");
  createDb(production);
  const beforeHash = sha256File(production);
  const migration = { id: "0004.synthetic-column", description: "synthetic upgrade", sql: "ALTER TABLE items ADD COLUMN note TEXT NOT NULL DEFAULT '';" };
  try {
    const pending = await executeCandidateMigration({ productionDb: production, candidateDb: candidate, statePath, migrations: [migration] });
    assert.equal(pending.migrationTarget, candidate);
    assert.equal(pending.productionDbMutatedBeforeCommit, false);
    assert.equal(sha256File(production), beforeHash, "候选迁移不得改写生产数据库");
    const candidateDb = new Database(candidate, { readonly: true });
    assert.equal(candidateDb.prepare("SELECT note FROM items").get().note, "");
    candidateDb.close();

    const pointer = path.join(root, "active-release.json");
    const committed = await commitUpgrade({ productionDb: production, candidateDb: candidate, pointerPath: pointer, version: "1.1.0", statePath });
    assert.equal(committed.productionDbMutatedBeforeCommit, true);
    assert.equal(JSON.parse(fs.readFileSync(pointer, "utf8")).version, "1.1.0");

    const failedCandidate = path.join(root, "failed", "auth.sqlite");
    const failed = await executeCandidateMigration({ productionDb: production, candidateDb: failedCandidate, statePath: path.join(root, "failed-state.json"), migrations: [{ id: "0005.bad", description: "bad", sql: "ALTER TABLE missing ADD COLUMN nope TEXT;" }] });
    assert.equal(failed.reusable, false);
    assert.equal(failed.phase, "failed");
    assert.equal(fs.existsSync(`${failedCandidate}.failed`), true);

    const recovered = recoverUpgrade({ statePath, productionDb: production, pointerPath: pointer });
    assert.equal(recovered.action, "already_committed");
    console.log("test-windows-upgrade: ok");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exit(1); });
