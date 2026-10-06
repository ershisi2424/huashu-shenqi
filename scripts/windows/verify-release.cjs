const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const REQUIRED_FILES = [
  ".next/standalone/server.js",
  ".next/static",
  "public",
  "vendor/goutoujunshi",
  "scripts/windows/huashu-launcher.cjs",
  "lib/windows-installer-config.cjs",
  "lib/provider-config-file.cjs",
  ".next/standalone/node_modules/better-sqlite3/prebuilds/win32-x64.node",
];
const FORBIDDEN_BASENAMES = /^(?:\.env(?:\..*)?|.*\.sqlite(?:-(?:wal|shm))?|.*\.db(?:-(?:wal|shm))?|sessions?|tokens?|uploads?|logs?)$/i;

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function exists(root, relative) {
  return fs.existsSync(path.join(root, relative));
}

function assertReleaseContents(root) {
  for (const relative of REQUIRED_FILES) {
    if (!exists(root, relative)) fail("RELEASE_REQUIRED_FILE_MISSING", `缺少发布文件: ${relative}`);
  }
  const violations = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute);
      if (FORBIDDEN_BASENAMES.test(entry.name)) violations.push(relative);
      if (entry.isDirectory()) walk(absolute);
    }
  };
  walk(root);
  if (violations.length) fail("RELEASE_FORBIDDEN_FILE", violations.slice(0, 5).join(", "));
}

function nativeSmoke(root, platform, arch) {
  if (platform !== "win32" || arch !== "x64") return "WINDOWS_NATIVE_SMOKE_PENDING";
  const standaloneServer = path.join(root, ".next", "standalone", "server.js");
  try {
    const requireFromRelease = createRequire(standaloneServer);
    const Database = requireFromRelease("better-sqlite3");
    const temporary = path.join(root, ".windows-native-smoke.sqlite");
    const db = new Database(temporary);
    const result = db.prepare("PRAGMA integrity_check").pluck().get();
    db.close();
    fs.rmSync(temporary, { force: true });
    if (result !== "ok") fail("WINDOWS_NATIVE_SMOKE_FAILED", "better-sqlite3 integrity check failed");
    return "WINDOWS_NATIVE_SMOKE_PASSED";
  } catch (error) {
    if (error?.code && String(error.code).startsWith("WINDOWS_NATIVE_SMOKE")) throw error;
    fail("WINDOWS_NATIVE_SMOKE_FAILED", error?.message || "无法加载 Windows 原生 SQLite 模块");
  }
}

function inventory(root) {
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const stat = fs.statSync(absolute);
      if (stat.isDirectory()) walk(absolute);
      else if (stat.isFile()) {
        const body = fs.readFileSync(absolute);
        files.push({ path: path.relative(root, absolute).replaceAll(path.sep, "/"), size: body.length, sha256: crypto.createHash("sha256").update(body).digest("hex") });
      }
    }
  };
  walk(root);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function verifyReleaseDirectory(root, { platform = process.platform, arch = process.arch } = {}) {
  const releaseRoot = path.resolve(root);
  if (!fs.existsSync(releaseRoot) || !fs.statSync(releaseRoot).isDirectory()) fail("RELEASE_ROOT_INVALID", "发布目录不存在");
  assertReleaseContents(releaseRoot);
  const status = nativeSmoke(releaseRoot, platform, arch);
  return { ok: true, root: releaseRoot, nativeSmoke: status, files: inventory(releaseRoot) };
}

module.exports = { FORBIDDEN_BASENAMES, REQUIRED_FILES, verifyReleaseDirectory };
