const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("./package.json");

const { assertSafeBrowserRegressionEnv, BrowserPreflightError } = require("./lib/browser-regression-preflight.cjs");
const projectRoot = path.resolve(__dirname);
const tempDb = path.join(os.tmpdir(), "huashu-browser-regression", "auth.sqlite");
assert.equal(packageJson.scripts["browser:preflight"], "node scripts/browser-regression-preflight.cjs");

function baseEnv(overrides = {}) {
  return {
    NODE_ENV: "test",
    AUTH_REQUIRED: "true",
    AUTH_COOKIE_SECURE: "false",
    AUTH_DB_PATH: tempDb,
    BASE_URL: "http://127.0.0.1:32123",
    ...overrides,
  };
}

function expectCode(env, code) {
  assert.throws(() => assertSafeBrowserRegressionEnv(env, { projectRoot }), (error) => error instanceof BrowserPreflightError && error.code === code);
}

const safe = assertSafeBrowserRegressionEnv(baseEnv(), { projectRoot });
assert.equal(safe.ok, true);
assert.equal(safe.baseUrl, "http://127.0.0.1:32123");
assert.equal(safe.database, "external-temp");
assert.equal(JSON.stringify(safe).includes(tempDb), false);

expectCode(baseEnv({ NODE_ENV: "development" }), "NODE_ENV_REQUIRED");
expectCode(baseEnv({ AUTH_REQUIRED: "false" }), "AUTH_REQUIRED");
expectCode(baseEnv({ AUTH_COOKIE_SECURE: "true" }), "AUTH_COOKIE_SECURE");
expectCode(baseEnv({ BASE_URL: "http://127.0.0.1:3102" }), "BASE_URL_FORBIDDEN_PORT");
expectCode(baseEnv({ BASE_URL: "https://example.com:32123" }), "BASE_URL_HOST_FORBIDDEN");
expectCode(baseEnv({ BASE_URL: "not-a-url" }), "BASE_URL_INVALID");
expectCode(baseEnv({ BASE_URL: "http://127.0.0.1" }), "BASE_URL_PORT_REQUIRED");
expectCode(baseEnv({ AUTH_DB_PATH: path.join(projectRoot, "data", "auth.sqlite") }), "AUTH_DB_PATH_FORBIDDEN");
expectCode(baseEnv({ AUTH_DB_PATH: ":memory:" }), "AUTH_DB_PATH_FORBIDDEN");
expectCode(baseEnv({ ZAI_API_KEY: "real-secret" }), "PROVIDER_SECRET_PRESENT");
expectCode(baseEnv({ HH_SESSION: "session-cookie" }), "BROWSER_COOKIE_PRESENT");

console.log("test-browser-regression-preflight: ok");
