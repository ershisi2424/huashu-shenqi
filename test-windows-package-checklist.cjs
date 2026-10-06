const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const windowsDir = path.join(__dirname, "scripts", "windows");
const packageScript = fs.readFileSync(path.join(windowsDir, "package-release.ps1"), "utf8");
const verifyScript = fs.readFileSync(path.join(windowsDir, "verify-package.ps1"), "utf8");
const runtimeVerifyScript = fs.readFileSync(path.join(windowsDir, "verify-package-runtime.ps1"), "utf8");
const checklist = fs.readFileSync(path.join(__dirname, "docs", "production", "WINDOWS-RELEASE-CHECKLIST.md"), "utf8");
const notices = fs.readFileSync(path.join(__dirname, "docs", "production", "THIRD-PARTY-NOTICES.md"), "utf8");

for (const text of [packageScript, verifyScript, runtimeVerifyScript, checklist]) {
  assert.match(text, /SHA-?256/i);
  assert.match(text, /x64/i);
  assert.match(text, /Authenticode|签名/i);
  assert.match(text, /ProgramData/i);
  assert.match(text, /保留|retain|preserve/i);
}
assert.match(packageScript, /INTERNAL_UNVERIFIED/);
assert.ok(packageScript.includes('"scripts\\windows\\verify-package-runtime.ps1"'));
assert.match(runtimeVerifyScript, /Get-AuthenticodeSignature/);
assert.match(runtimeVerifyScript, /WINDOWS_NATIVE_MODULE_MISSING/);
assert.match(checklist, /setup|初始化/i);
assert.match(checklist, /API|Provider/i);
assert.match(checklist, /升级|upgrade/i);
assert.match(notices, /better-sqlite3/);
assert.doesNotMatch(packageScript, /ZAI_API_KEY\s*[:=]/i);
assert.doesNotMatch(verifyScript, /ZAI_API_KEY\s*[:=]/i);

console.log("test-windows-package-checklist: ok");
