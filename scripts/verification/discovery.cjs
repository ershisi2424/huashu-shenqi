const fs = require("node:fs");
const path = require("node:path");

const SELF_TEST = "test-verification-runner.cjs";

function discoverTests(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /^test-[^/]+\.cjs$/.test(name) && name !== SELF_TEST)
    .sort((a, b) => a.localeCompare(b));
}

function resolveTestPath(root, relativePath) {
  const absoluteRoot = path.resolve(root);
  const absolutePath = path.resolve(absoluteRoot, relativePath);
  if (!absolutePath.startsWith(`${absoluteRoot}${path.sep}`)) throw new Error("TEST_PATH_OUTSIDE_ROOT");
  return absolutePath;
}

module.exports = { discoverTests, resolveTestPath, SELF_TEST };
