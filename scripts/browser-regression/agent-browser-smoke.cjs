#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const {
  assertSafeBrowserRegressionEnv,
  BROWSER_COOKIE_NAMES,
  BrowserPreflightError,
  PROVIDER_SECRET_NAMES,
} = require("../../lib/browser-regression-preflight.cjs");

function fail(code) {
  const error = new Error(`BROWSER_RUNNER_FAILED ${code}`);
  error.code = code;
  throw error;
}

function sessionName(value) {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (candidate && /^[a-zA-Z0-9._-]{1,80}$/.test(candidate)) return candidate;
  return `huashu-regression-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
}

function safeEnvironment() {
  const next = { ...process.env };
  for (const key of [...PROVIDER_SECRET_NAMES, ...BROWSER_COOKIE_NAMES]) delete next[key];
  delete next.NODE_OPTIONS;
  return next;
}

function runBrowser(binary, session, args, step) {
  const result = spawnSync(binary, ["--session", session, ...args], {
    cwd: process.cwd(),
    env: safeEnvironment(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000,
  });
  if (result.error?.code === "ENOENT") fail("AGENT_BROWSER_NOT_FOUND");
  if (result.error?.code === "ETIMEDOUT") fail(`AGENT_BROWSER_${step.toUpperCase()}_TIMEOUT`);
  if (result.status !== 0) fail(`AGENT_BROWSER_${step.toUpperCase()}_FAILED`);
  return typeof result.stdout === "string" ? result.stdout.trim() : "";
}

function main() {
  let summary;
  try {
    summary = assertSafeBrowserRegressionEnv(process.env, { projectRoot: process.cwd() });
  } catch (error) {
    if (error instanceof BrowserPreflightError) throw error;
    fail("PREFLIGHT_INTERNAL");
  }
  if (process.env.BROWSER_REGRESSION_EXECUTE !== "true") fail("BROWSER_RUNNER_NOT_ENABLED");

  const binary = typeof process.env.AGENT_BROWSER_BIN === "string" && process.env.AGENT_BROWSER_BIN.trim()
    ? process.env.AGENT_BROWSER_BIN.trim()
    : "agent-browser";
  const session = sessionName(process.env.AGENT_BROWSER_SESSION);
  const loginUrl = new URL("/login/", process.env.BASE_URL).toString();
  let opened = false;
  try {
    runBrowser(binary, session, ["open", loginUrl], "open");
    opened = true;
    runBrowser(binary, session, ["wait", "--load", "networkidle"], "wait");
    const currentUrl = runBrowser(binary, session, ["get", "url"], "url");
    if (!currentUrl.startsWith(summary.baseUrl)) fail("BROWSER_ORIGIN_CHANGED");
    process.stdout.write(`${JSON.stringify({ ok: true, browserSmoke: true, baseUrl: summary.baseUrl, session: "isolated" })}\n`);
  } finally {
    if (opened) {
      try { runBrowser(binary, session, ["close"], "close"); } catch { /* 浏览器已退出时不回显内部输出 */ }
    }
  }
}

try {
  main();
} catch (error) {
  const code = error instanceof BrowserPreflightError ? error.code : error?.code || "INTERNAL";
  process.stderr.write(`${error instanceof BrowserPreflightError ? error.message : `BROWSER_RUNNER_FAILED ${code}`}\n`);
  process.exitCode = 1;
}
