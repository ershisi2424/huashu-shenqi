const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { verifyReleaseDirectory } = require("./scripts/windows/verify-release.cjs");
const nextConfig = require("./next.config.js");

assert.equal(nextConfig.output, "standalone", "生产构建必须使用 Next standalone 输出");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-release-"));
try {
  for (const file of [
    ".next/standalone/server.js",
    ".next/standalone/node_modules/better-sqlite3/prebuilds/win32-x64.node",
    ".next/static/chunks/app.js",
    "public/sw.js",
    "vendor/goutoujunshi/SKILL.md",
    "scripts/windows/huashu-launcher.cjs",
    "lib/windows-installer-config.cjs",
    "lib/provider-config-file.cjs",
  ]) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "synthetic");
  }
  const result = verifyReleaseDirectory(root, { platform: "darwin", arch: "arm64" });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.nativeSmoke, "WINDOWS_NATIVE_SMOKE_PENDING");
  fs.writeFileSync(path.join(root, ".env.local"), "ZAI_API_KEY=secret\n");
  assert.throws(() => verifyReleaseDirectory(root, { platform: "darwin", arch: "arm64" }), /RELEASE_FORBIDDEN_FILE/);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("test-windows-release: ok");
