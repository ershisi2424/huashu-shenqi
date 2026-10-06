const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { validateReleaseManifest } = require("./lib/windows-release-manifest.cjs");

const installerDir = path.join(__dirname, "scripts", "windows", "installer");
const download = fs.readFileSync(path.join(installerDir, "download-components.ps1"), "utf8");
const verify = fs.readFileSync(path.join(installerDir, "verify-component.ps1"), "utf8");
const stage = fs.readFileSync(path.join(installerDir, "stage-release.ps1"), "utf8");
const example = JSON.parse(fs.readFileSync(path.join(installerDir, "release-manifest.example.json"), "utf8"));

assert.match(download, /Invoke-WebRequest/);
assert.match(download, /Retry|重试/);
assert.match(download, /https/i);
assert.match(download, /quarantine|隔离/i);
assert.match(verify, /Get-FileHash/);
assert.match(verify, /SHA256/i);
assert.match(verify, /Length|大小/);
assert.match(stage, /Expand-Archive/);
assert.match(stage, /\.\.|路径穿越|traversal/i);
assert.match(stage, /active-release\.json/);
assert.match(stage, /Move-Item/);
assert.equal(validateReleaseManifest(example).platform, "win32");
assert.equal(validateReleaseManifest(example).arch, "x64");
assert.throws(() => validateReleaseManifest({ ...example, components: [{ ...example.components[0], url: "http://example.test/component.zip" }] }), /COMPONENT_URL_NOT_HTTPS/);
assert.throws(() => validateReleaseManifest({ ...example, components: [{ ...example.components[0], relativePath: "../../outside.zip" }] }), /COMPONENT_PATH_TRAVERSAL/);
assert.throws(() => validateReleaseManifest({ ...example, components: [{ ...example.components[0], size: 0 }] }), /COMPONENT_SIZE_INVALID/);
assert.throws(() => validateReleaseManifest({ ...example, components: [{ ...example.components[0], sha256: "0" }] }), /COMPONENT_SHA256_INVALID/);

console.log("test-windows-download-contract: ok");
