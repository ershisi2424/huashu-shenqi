const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const dir = path.join(__dirname, "scripts", "windows", "installer");
const nsi = fs.readFileSync(path.join(dir, "Huashu-Setup.nsi"), "utf8");
const config = JSON.parse(fs.readFileSync(path.join(dir, "installer-config.json"), "utf8"));
const repair = fs.readFileSync(path.join(dir, "repair.ps1"), "utf8");
const uninstall = fs.readFileSync(path.join(dir, "uninstall-preserve-data.ps1"), "utf8");
const compile = fs.readFileSync(path.join(dir, "compile-installer.cjs"), "utf8");

assert.equal(config.serviceName, "HuashuWorkbench");
assert.match(nsi, /HuashuWorkbench/);
assert.match(nsi, /download-components\.ps1/);
assert.match(nsi, /stage-release\.ps1/);
assert.match(nsi, /provider|初始化|setup/i);
assert.match(nsi, /ProgramData/);
assert.match(nsi, /保存|preserve|保留/i);
assert.match(repair, /verify-release|windows-deploy-check|健康|health/i);
assert.match(uninstall, /ProgramData/);
assert.match(uninstall, /保留|preserve/i);
assert.doesNotMatch(nsi, /ZAI_API_KEY\s*=|password\s*=|api[_-]?key\s*=/i);
assert.doesNotMatch(repair, /ZAI_API_KEY\s*=|password\s*=/i);
assert.doesNotMatch(uninstall, /ZAI_API_KEY\s*=|password\s*=/i);
assert.match(compile, /HUASHU_ARTIFACT_BASE_URL/);
assert.match(compile, /HUASHU_RELEASE_MANIFEST/);
assert.match(compile, /WINDOWS_TOOLCHAIN_REQUIRED/);

console.log("test-windows-installer-script: ok");
