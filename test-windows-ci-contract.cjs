const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workflow = fs.readFileSync(path.join(__dirname, ".github", "workflows", "windows-installer.yml"), "utf8");
const smoke = fs.readFileSync(path.join(__dirname, "scripts", "windows", "ci-install-smoke.ps1"), "utf8");
assert.match(workflow, /windows-2022/);
assert.match(workflow, /npm ci/);
assert.match(workflow, /npm test/);
assert.match(workflow, /npm run build/);
assert.match(workflow, /ci-install-smoke\.ps1/);
assert.match(smoke, /better-sqlite3/);
assert.match(smoke, /integrity_check|integrity/i);
assert.match(smoke, /WINDOWS_NATIVE_SMOKE/);
assert.match(smoke, /Invoke-WebRequest/);
assert.match(smoke, /Stop-Process/);
assert.doesNotMatch(workflow, /ZAI_API_KEY\s*[:=]/i);
assert.doesNotMatch(smoke, /ZAI_API_KEY\s*[:=]/i);
console.log("test-windows-ci-contract: ok");
