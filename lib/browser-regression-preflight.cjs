const path = require("node:path");

const FORBIDDEN_PORT = 3102;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const PROVIDER_SECRET_NAMES = [
  "ZAI_API_KEY",
  "GLM_API_KEY",
  "DASHSCOPE_API_KEY",
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY",
  "AI_API_KEY",
];
const BROWSER_COOKIE_NAMES = [
  "AUTH_COOKIE",
  "BROWSER_COOKIE",
  "COOKIE_HEADER",
  "HH_SESSION",
  "HH_GUEST_SESSION",
  "PLAYWRIGHT_STORAGE_STATE",
];

class BrowserPreflightError extends Error {
  constructor(code) {
    super(`BROWSER_PREFLIGHT_FAILED ${code}`);
    this.name = "BrowserPreflightError";
    this.code = code;
  }
}

function fail(code) {
  throw new BrowserPreflightError(code);
}

function hasValue(env, name) {
  return typeof env?.[name] === "string" && env[name].trim().length > 0;
}

function isInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertSafeBrowserRegressionEnv(env = process.env, { projectRoot = process.cwd() } = {}) {
  if (env?.NODE_ENV !== "test") fail("NODE_ENV_REQUIRED");
  if (env?.AUTH_REQUIRED !== "true") fail("AUTH_REQUIRED");
  if (env?.AUTH_COOKIE_SECURE !== "false") fail("AUTH_COOKIE_SECURE");

  const rawBaseUrl = typeof env?.BASE_URL === "string" ? env.BASE_URL.trim() : "";
  if (!rawBaseUrl) fail("BASE_URL_REQUIRED");
  let baseUrl;
  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    fail("BASE_URL_INVALID");
  }
  if (!baseUrl || !["http:", "https:"].includes(baseUrl.protocol)) fail("BASE_URL_PROTOCOL_FORBIDDEN");
  if (!LOOPBACK_HOSTS.has(baseUrl.hostname)) fail("BASE_URL_HOST_FORBIDDEN");
  if (!baseUrl.port) fail("BASE_URL_PORT_REQUIRED");
  const port = Number(baseUrl.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) fail("BASE_URL_PORT_INVALID");
  if (port === FORBIDDEN_PORT) fail("BASE_URL_FORBIDDEN_PORT");
  if (baseUrl.username || baseUrl.password) fail("BASE_URL_CREDENTIALS_FORBIDDEN");

  const rawDbPath = typeof env?.AUTH_DB_PATH === "string" ? env.AUTH_DB_PATH.trim() : "";
  if (!rawDbPath || rawDbPath === ":memory:") fail("AUTH_DB_PATH_FORBIDDEN");
  const resolvedProjectRoot = path.resolve(projectRoot);
  const resolvedDbPath = path.resolve(rawDbPath);
  if (isInside(resolvedProjectRoot, resolvedDbPath)) fail("AUTH_DB_PATH_FORBIDDEN");
  if (!/\.sqlite(?:3)?$/i.test(resolvedDbPath)) fail("AUTH_DB_PATH_EXTENSION");

  if (PROVIDER_SECRET_NAMES.some((name) => hasValue(env, name))) fail("PROVIDER_SECRET_PRESENT");
  if (BROWSER_COOKIE_NAMES.some((name) => hasValue(env, name))) fail("BROWSER_COOKIE_PRESENT");

  return {
    ok: true,
    baseUrl: baseUrl.origin,
    database: "external-temp",
    authRequired: true,
    provider: "mock",
  };
}

module.exports = {
  BROWSER_COOKIE_NAMES,
  FORBIDDEN_PORT,
  PROVIDER_SECRET_NAMES,
  BrowserPreflightError,
  assertSafeBrowserRegressionEnv,
};
