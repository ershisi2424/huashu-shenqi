const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const { applyMigrations, getMigrationLedger } = require("./db-migrations.cjs");

const UPGRADE_PHASES = Object.freeze(["downloaded", "staged", "maintenance_locked", "backup_verified", "candidate_migrated", "candidate_verified", "committing", "committed", "failed", "rolled_back"]);

function absolute(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}_REQUIRED`);
  return path.resolve(value);
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(absolute(filePath, "FILE"))).digest("hex");
}

function writeJsonAtomic(filePath, value) {
  const target = absolute(filePath, "STATE_PATH");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  try { fsyncFile(temporary); } catch { /* best effort on Windows */ }
  fs.renameSync(temporary, target);
}

function fsyncFile(filePath) {
  const handle = fs.openSync(filePath, "r");
  try { fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
}

function readState(statePath) {
  const target = absolute(statePath, "STATE_PATH");
  try { return JSON.parse(fs.readFileSync(target, "utf8")); } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function saveState(statePath, state) {
  if (!UPGRADE_PHASES.includes(state.phase)) throw new Error("UPGRADE_PHASE_INVALID");
  writeJsonAtomic(statePath, state);
  return state;
}

function verifyIntegrity(filePath) {
  const db = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    if (db.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("CANDIDATE_INTEGRITY_FAILED");
    return getMigrationLedger(db);
  } finally { db.close(); }
}

async function backupToCandidate(sourcePath, candidatePath) {
  fs.mkdirSync(path.dirname(candidatePath), { recursive: true });
  if (fs.existsSync(candidatePath)) throw new Error("CANDIDATE_NOT_REUSABLE");
  const sourceDb = new Database(sourcePath, { fileMustExist: true });
  try {
    try { sourceDb.pragma("wal_checkpoint(TRUNCATE)"); } catch { /* rollback-journal databases do not support this pragma */ }
    await sourceDb.backup(candidatePath);
  } finally { sourceDb.close(); }
}

async function executeCandidateMigration({ productionDb, candidateDb, statePath, migrations = [] } = {}) {
  const productionPath = absolute(productionDb, "PRODUCTION_DB");
  const candidatePath = absolute(candidateDb, "CANDIDATE_DB");
  const beforeHash = sha256File(productionPath);
  let state = {
    phase: "staged",
    productionDb: productionPath,
    migrationTarget: candidatePath,
    productionHashBefore: beforeHash,
    productionDbMutatedBeforeCommit: false,
    reusable: true,
    updatedAt: new Date().toISOString(),
  };
  saveState(statePath, state);
  try {
    await backupToCandidate(productionPath, candidatePath);
    state = { ...state, phase: "backup_verified", updatedAt: new Date().toISOString() };
    saveState(statePath, state);
    const candidate = new Database(candidatePath);
    try {
      applyMigrations(candidate, migrations);
      if (candidate.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("CANDIDATE_INTEGRITY_FAILED");
    } finally { candidate.close(); }
    state = { ...state, phase: "candidate_migrated", updatedAt: new Date().toISOString() };
    saveState(statePath, state);
    verifyIntegrity(candidatePath);
    state = { ...state, phase: "candidate_verified", updatedAt: new Date().toISOString() };
    saveState(statePath, state);
    return state;
  } catch (error) {
    let failedPath = candidatePath;
    if (fs.existsSync(candidatePath)) {
      failedPath = `${candidatePath}.failed`;
      fs.rmSync(failedPath, { force: true });
      fs.renameSync(candidatePath, failedPath);
    }
    state = { ...state, phase: "failed", reusable: false, failedCandidate: failedPath, failureCode: String(error?.message || "UPGRADE_FAILED").slice(0, 120), updatedAt: new Date().toISOString() };
    saveState(statePath, state);
    return state;
  }
}

async function commitUpgrade({ productionDb, candidateDb, pointerPath, version, statePath } = {}) {
  const productionPath = absolute(productionDb, "PRODUCTION_DB");
  const candidatePath = absolute(candidateDb, "CANDIDATE_DB");
  const pointer = absolute(pointerPath, "POINTER_PATH");
  const state = readState(statePath);
  if (!state || state.phase !== "candidate_verified" || state.migrationTarget !== candidatePath || !state.reusable) throw new Error("UPGRADE_CANDIDATE_NOT_VERIFIED");
  if (sha256File(productionPath) !== state.productionHashBefore) throw new Error("PRODUCTION_DB_CHANGED");
  const previous = `${productionPath}.previous-${String(version).replace(/[^A-Za-z0-9._-]/g, "_")}`;
  if (fs.existsSync(previous)) throw new Error("PREVIOUS_DB_EXISTS");
  saveState(statePath, { ...state, phase: "committing", updatedAt: new Date().toISOString() });
  let productionMoved = false;
  try {
    fs.renameSync(productionPath, previous);
    productionMoved = true;
    fs.renameSync(candidatePath, productionPath);
    const pointerPayload = { version: String(version), updatedAt: new Date().toISOString() };
    writeJsonAtomic(pointer, pointerPayload);
    const committed = { ...state, phase: "committed", previousDb: previous, pointerPath: pointer, version: String(version), productionDbMutatedBeforeCommit: true, updatedAt: new Date().toISOString() };
    saveState(statePath, committed);
    return committed;
  } catch (error) {
    if (productionMoved && !fs.existsSync(productionPath) && fs.existsSync(previous)) fs.renameSync(previous, productionPath);
    throw error;
  }
}

function recoverUpgrade({ statePath, productionDb, pointerPath } = {}) {
  const state = readState(statePath);
  if (!state) return { action: "no_state" };
  if (state.phase === "committed") return { action: "already_committed", state };
  if (state.phase === "committing") {
    const productionPath = absolute(productionDb, "PRODUCTION_DB");
    if (!fs.existsSync(productionPath) && state.previousDb && fs.existsSync(state.previousDb)) {
      fs.renameSync(state.previousDb, productionPath);
      const rolledBack = { ...state, phase: "rolled_back", productionDbMutatedBeforeCommit: false, updatedAt: new Date().toISOString() };
      saveState(statePath, rolledBack);
      return { action: "restored_previous", state: rolledBack };
    }
    return { action: "manual_review_required", state };
  }
  if (["staged", "backup_verified", "candidate_migrated", "candidate_verified"].includes(state.phase)) return { action: "candidate_pending", state };
  return { action: state.phase, state };
}

module.exports = { UPGRADE_PHASES, commitUpgrade, executeCandidateMigration, recoverUpgrade, readState, saveState, sha256File };
