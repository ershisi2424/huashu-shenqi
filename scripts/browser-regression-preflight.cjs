#!/usr/bin/env node

const { assertSafeBrowserRegressionEnv, BrowserPreflightError } = require("../lib/browser-regression-preflight.cjs");

try {
  const summary = assertSafeBrowserRegressionEnv(process.env, { projectRoot: process.cwd() });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
} catch (error) {
  if (error instanceof BrowserPreflightError) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  } else {
    process.stderr.write("BROWSER_PREFLIGHT_FAILED INTERNAL\n");
    process.exitCode = 1;
  }
}
