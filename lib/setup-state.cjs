const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SETUP_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hashCode(code) {
  return crypto.createHash("sha256").update(String(code), "utf8").digest("hex");
}

function timingSafeHashEqual(left, right) {
  const a = Buffer.from(String(left || ""), "hex");
  const b = Buffer.from(String(right || ""), "hex");
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function createSetupState({ filePath = process.env.SETUP_STATE_PATH || path.join(process.cwd(), "data", "setup-state.json"), now = Date.now, randomBytes = crypto.randomBytes, ttlMs = SETUP_TTL_MS, maxAttempts = MAX_ATTEMPTS } = {}) {
  const target = path.resolve(/* turbopackIgnore: true */ filePath);
  const lifetime = Math.max(60_000, Math.min(Number(ttlMs) || SETUP_TTL_MS, 60 * 60 * 1000));
  const attemptsLimit = Math.max(1, Math.min(Number(maxAttempts) || MAX_ATTEMPTS, 20));
  let cached = null;

  function read() {
    if (cached) return cached;
    try {
      const parsed = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ target, "utf8"));
      if (!parsed || typeof parsed !== "object" || typeof parsed.codeHash !== "string") return null;
      cached = {
        codeHash: parsed.codeHash,
        issuedAt: Number(parsed.issuedAt),
        expiresAt: Number(parsed.expiresAt),
        failures: Number(parsed.failures) || 0,
        consumed: parsed.consumed === true,
        locked: parsed.locked === true,
      };
      return cached;
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      return null;
    }
  }

  function persist(value) {
    const parent = path.dirname(target);
    fs.mkdirSync(parent, { recursive: true });
    const temporary = path.join(parent, `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    try { fs.chmodSync(temporary, 0o600); } catch { /* Windows ACLs are applied by the installer. */ }
    fs.renameSync(temporary, target);
    cached = value;
  }

  function issue() {
    const issuedAt = Number(now());
    const code = randomBytes(18).toString("base64url");
    persist({ codeHash: hashCode(code), issuedAt, expiresAt: issuedAt + lifetime, failures: 0, consumed: false, locked: false });
    return { code, issuedAt, expiresAt: issuedAt + lifetime };
  }

  function status(at = Number(now())) {
    const current = read();
    if (!current) return { issued: false, active: false, consumed: false, locked: false, failures: 0, expiresAt: null };
    const expired = Number(at) >= current.expiresAt;
    return {
      issued: true,
      active: !expired && !current.consumed && !current.locked,
      consumed: current.consumed,
      locked: current.locked,
      expired,
      failures: current.failures,
      expiresAt: current.expiresAt,
    };
  }

  function verify(code, at = Number(now())) {
    const current = read();
    if (!current || current.consumed || current.locked || Number(at) >= current.expiresAt) return false;
    if (typeof code === "string" && timingSafeHashEqual(hashCode(code.trim()), current.codeHash)) {
      persist({ ...current, consumed: true });
      return true;
    }
    const failures = current.failures + 1;
    persist({ ...current, failures, locked: failures >= attemptsLimit });
    return false;
  }

  function revoke() {
    const current = read();
    if (current) persist({ ...current, consumed: true });
  }

  return { issue, status, verify, revoke };
}

module.exports = { MAX_ATTEMPTS, SETUP_TTL_MS, createSetupState, hashCode };
