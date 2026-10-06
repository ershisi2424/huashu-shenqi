const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { discoverTests, resolveTestPath } = require("./discovery.cjs");

const SAFE_ENV_KEYS = ["PATH", "SystemRoot", "WINDIR", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "TZ"];
const DEFAULT_TIMEOUT_MS = 90_000;

function testEnvironment(sourceEnv = process.env, testRoot) {
  const env = {};
  for (const key of SAFE_ENV_KEYS) if (typeof sourceEnv[key] === "string") env[key] = sourceEnv[key];
  env.NODE_ENV = "test";
  env.AUTH_DB_PATH = path.join(testRoot, "auth.sqlite");
  return env;
}

function runOne(root, relativePath, options = {}) {
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) && Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-suite-"));
  const startedAt = Date.now();
  try {
    const result = spawnSync(process.execPath, [resolveTestPath(root, relativePath)], {
      cwd: root,
      env: testEnvironment(options.env || process.env, isolatedRoot),
      encoding: "utf8",
      timeout: timeoutMs,
      killSignal: "SIGTERM",
      stdio: options.stdio === "inherit" ? "inherit" : "pipe",
    });
    const timedOut = result.error?.code === "ETIMEDOUT";
    const errorCode = timedOut ? "ETIMEDOUT" : result.error?.code || "";
    const passed = !timedOut && !result.error && result.status === 0;
    return {
      file: relativePath,
      status: passed ? "passed" : timedOut ? "timed_out" : "failed",
      ok: passed,
      exitCode: typeof result.status === "number" ? result.status : null,
      signal: result.signal || "",
      errorCode,
      durationMs: Date.now() - startedAt,
      stdout: typeof result.stdout === "string" ? result.stdout : "",
      stderr: typeof result.stderr === "string" ? result.stderr : "",
    };
  } finally {
    fs.rmSync(isolatedRoot, { recursive: true, force: true });
  }
}

function runSuite(root, options = {}) {
  const tests = discoverTests(root);
  if (!tests.length) throw new Error("EMPTY_TEST_SUITE");
  const results = [];
  for (const file of tests) {
    const result = runOne(root, file, options);
    results.push(result);
    if (!result.ok) return { ok: false, results };
  }
  return { ok: true, results };
}

module.exports = { DEFAULT_TIMEOUT_MS, SAFE_ENV_KEYS, testEnvironment, runOne, runSuite };
