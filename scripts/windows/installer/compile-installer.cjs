const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const baseUrl = String(process.env.HUASHU_ARTIFACT_BASE_URL || "").trim();
const manifest = String(process.env.HUASHU_RELEASE_MANIFEST || "").trim();
if (!baseUrl || !manifest) {
  console.error("WINDOWS_INSTALLER_CONFIG_REQUIRED: set HUASHU_ARTIFACT_BASE_URL and HUASHU_RELEASE_MANIFEST");
  process.exit(2);
}
let makensis = process.env.MAKENSIS_PATH || "makensis";
if (process.platform !== "win32" && !process.env.MAKENSIS_PATH) {
  const probe = childProcess.spawnSync("which", ["makensis"], { encoding: "utf8" });
  if (probe.status !== 0) {
    console.error("WINDOWS_TOOLCHAIN_REQUIRED: makensis is not available; no fake EXE was created");
    process.exit(3);
  }
  makensis = probe.stdout.trim() || makensis;
}
const script = path.join(__dirname, "Huashu-Setup.nsi");
if (!fs.existsSync(script)) throw new Error("NSIS_SCRIPT_MISSING");
const result = childProcess.spawnSync(makensis, [`/DHUASHU_ARTIFACT_BASE_URL=${baseUrl}`, `/DHUASHU_RELEASE_MANIFEST=${manifest}`, script], { stdio: "inherit" });
process.exit(result.status === null ? 1 : result.status);
