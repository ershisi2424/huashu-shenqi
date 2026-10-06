const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { FORBIDDEN_BASENAMES, verifyReleaseDirectory } = require("./verify-release.cjs");

function purgeDevelopmentFiles(root) {
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (FORBIDDEN_BASENAMES.test(entry.name)) {
        fs.rmSync(absolute, { recursive: true, force: true });
        continue;
      }
      if (entry.isDirectory()) walk(absolute);
    }
  };
  walk(root);
}

function copyRequired(sourceDir, outputDir) {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  fs.cpSync(path.join(sourceDir, ".next", "standalone"), path.join(outputDir, ".next", "standalone"), { recursive: true, dereference: false });
  fs.cpSync(path.join(sourceDir, ".next", "static"), path.join(outputDir, ".next", "static"), { recursive: true, dereference: false });
  fs.cpSync(path.join(sourceDir, "public"), path.join(outputDir, "public"), { recursive: true, dereference: false });
  fs.cpSync(path.join(sourceDir, "vendor", "goutoujunshi"), path.join(outputDir, "vendor", "goutoujunshi"), { recursive: true, dereference: false });
  fs.mkdirSync(path.join(outputDir, "scripts", "windows"), { recursive: true });
  fs.copyFileSync(path.join(sourceDir, "scripts", "windows", "huashu-launcher.cjs"), path.join(outputDir, "scripts", "windows", "huashu-launcher.cjs"));
  fs.mkdirSync(path.join(outputDir, "lib"), { recursive: true });
  for (const file of ["windows-installer-config.cjs", "provider-config-file.cjs"]) {
    fs.copyFileSync(path.join(sourceDir, "lib", file), path.join(outputDir, "lib", file));
  }
  const windowsNativeSource = path.join(sourceDir, "node_modules", "better-sqlite3", "prebuilds", "win32-x64.node");
  if (!fs.existsSync(windowsNativeSource)) throw new Error("WINDOWS_NATIVE_MODULE_MISSING");
  const windowsNativeTarget = path.join(outputDir, ".next", "standalone", "node_modules", "better-sqlite3", "prebuilds", "win32-x64.node");
  fs.mkdirSync(path.dirname(windowsNativeTarget), { recursive: true });
  fs.copyFileSync(windowsNativeSource, windowsNativeTarget);
  purgeDevelopmentFiles(outputDir);
}

function buildRelease({ sourceDir = process.cwd(), outputDir } = {}) {
  if (!outputDir) throw new Error("RELEASE_OUTPUT_REQUIRED");
  const source = path.resolve(sourceDir);
  const output = path.resolve(outputDir);
  const result = childProcess.spawnSync(process.execPath, [require.resolve("next/dist/bin/next"), "build"], { cwd: source, stdio: "inherit", env: { ...process.env, NODE_ENV: "production" } });
  if (result.status !== 0) throw new Error("NEXT_BUILD_FAILED");
  copyRequired(source, output);
  const verified = verifyReleaseDirectory(output);
  fs.writeFileSync(path.join(output, "release-inventory.json"), `${JSON.stringify(verified, null, 2)}\n`, { mode: 0o600 });
  return verified;
}

if (require.main === module) {
  const outputIndex = process.argv.indexOf("--output");
  const sourceIndex = process.argv.indexOf("--source");
  const outputDir = outputIndex >= 0 ? process.argv[outputIndex + 1] : "";
  const sourceDir = sourceIndex >= 0 ? process.argv[sourceIndex + 1] : process.cwd();
  buildRelease({ sourceDir, outputDir });
}

module.exports = { buildRelease, copyRequired, purgeDevelopmentFiles };
