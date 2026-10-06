const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { buildChildEnvironment, classifyStartupState } = require("./scripts/windows/huashu-launcher.cjs");

const env = buildChildEnvironment({
  appDir: "C:\\Program Files\\Huashu\\releases\\1.0.0",
  dataDir: "C:\\ProgramData\\Huashu",
  port: 3102,
  bindHost: "0.0.0.0",
  provider: {},
});
assert.equal(env.NODE_ENV, "production");
assert.equal(env.AUTH_REQUIRED, "true");
assert.equal(env.AUTH_DB_PATH, "C:\\ProgramData\\Huashu\\data\\auth.sqlite");
assert.equal(env.AI_REPLY_CONFIG_PATH, "C:\\ProgramData\\Huashu\\config\\provider.json");
assert.equal(env.BIND_HOST, "0.0.0.0");
assert.equal(env.PORT, "3102");
assert.equal(env.ZAI_API_KEY, undefined);
assert.equal(classifyStartupState({ setupRequired: true, providerConfigured: false }), "SETUP_REQUIRED");
assert.equal(classifyStartupState({ setupRequired: false, providerConfigured: false }), "AI_NOT_CONFIGURED");
assert.equal(classifyStartupState({ setupRequired: false, providerConfigured: true }), "READY");
assert.throws(() => buildChildEnvironment({ appDir: "C:\\Program Files\\Huashu", dataDir: "C:\\ProgramData\\Huashu", port: 3102, bindHost: "0.0.0.0", provider: { AUTH_REQUIRED: "false" } }), /PROVIDER_FIELD_NOT_ALLOWED/);
const serviceXml = fs.readFileSync(path.join(__dirname, "scripts", "windows", "service", "HuashuWorkbench.xml"), "utf8");
assert.match(serviceXml, /Automatic/);
assert.match(serviceXml, /LocalService/);
assert.match(serviceXml, /onfailure action="restart"/);
const aclScript = fs.readFileSync(path.join(__dirname, "scripts", "windows", "acl.ps1"), "utf8");
assert.match(aclScript, /LOCAL SERVICE/i);
assert.match(aclScript, /Users/);
assert.doesNotMatch(aclScript, /ZAI_API_KEY/i);

console.log("test-windows-launcher: ok");
