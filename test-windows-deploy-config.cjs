const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  validateWindowsDeployConfig,
  formatValidationResult,
} = require("./lib/windows-deploy-config.cjs");

function validConfig(overrides = {}) {
  return {
    NODE_ENV: "production",
    NODE_VERSION: "22.15.1",
    APP_DIR: "/srv/huashu/app",
    AUTH_DB_PATH: "/srv/huashu/data/auth.sqlite",
    AUTH_REQUIRED: "true",
    ZAI_API_KEY: "secret-api-key",
    AUTH_COOKIE_SECURE: "true",
    HTTPS_TERMINATED: "true",
    BIND_HOST: "0.0.0.0",
    PORT: "3102",
    ...overrides,
  };
}

{
  const result = validateWindowsDeployConfig(validConfig());
  assert.equal(result.ok, true, `valid production config should pass: ${JSON.stringify(result)}`);
  assert.equal(result.config.apiKeyConfigured, true);
  assert.equal(result.config.authRequired, true);
  assert.equal(result.config.port, 3102);
  assert.equal(result.config.bindHost, "0.0.0.0");
  assert.equal(result.config.dataDir, null);
  assert.equal(JSON.stringify(result).includes("secret-api-key"), false, "validation result must not expose API secrets");
  assert.equal(formatValidationResult(result).includes("secret-api-key"), false, "formatted output must not expose API secrets");
}

{
  const result = validateWindowsDeployConfig(validConfig({ ZAI_API_KEY: "", CONFIG_FILE_CONFIGURED: "true" }));
  assert.equal(result.ok, true, "a protected local config file may provide the provider secret");
  assert.equal(result.config.apiKeyConfigured, true);
}

{
  const result = validateWindowsDeployConfig(validConfig({
    AUTH_REQUIRED: undefined,
    APP_DIR: "C:\\Huashu\\app",
    AUTH_DB_PATH: "C:\\Huashu\\data\\auth.sqlite",
  }));
  assert.equal(result.ok, true, `Windows absolute paths and production auth default should pass: ${JSON.stringify(result)}`);
  assert.equal(result.config.authRequired, true);
}

{
  const result = validateWindowsDeployConfig(validConfig({ NODE_ENV: "development" }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "NODE_ENV_NOT_PRODUCTION"));
}

{
  const result = validateWindowsDeployConfig(validConfig({ AUTH_REQUIRED: "false" }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "AUTH_REQUIRED_MUST_BE_TRUE"));
}

{
  const result = validateWindowsDeployConfig(validConfig({ NODE_VERSION: "20.19.0" }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "NODE_VERSION_UNSUPPORTED"));
}

{
  const relativeDb = validateWindowsDeployConfig(validConfig({ AUTH_DB_PATH: "data/auth.sqlite" }));
  assert.equal(relativeDb.ok, false);
  assert.ok(relativeDb.errors.some((error) => error.code === "AUTH_DB_PATH_NOT_ABSOLUTE"));

  const appDb = validateWindowsDeployConfig(validConfig({ AUTH_DB_PATH: "/srv/huashu/app/data/auth.sqlite" }));
  assert.equal(appDb.ok, false);
  assert.ok(appDb.errors.some((error) => error.code === "AUTH_DB_PATH_INSIDE_APP"));
}

{
  const result = validateWindowsDeployConfig(validConfig({
    DATA_DIR: "C:\\Huashu\\data",
    AUTH_DB_PATH: "C:\\Huashu\\data\\auth.sqlite",
    AI_REPLY_CONFIG_PATH: "C:\\Huashu\\data\\config\\provider.json",
  }));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.config.dataDir, "C:\\Huashu\\data");
  assert.equal(result.config.providerConfigPath, "C:\\Huashu\\data\\config\\provider.json");
}

{
  const result = validateWindowsDeployConfig(validConfig({
    DATA_DIR: "C:\\Huashu\\data",
    AUTH_DB_PATH: "C:\\Huashu\\other\\auth.sqlite",
  }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "AUTH_DB_PATH_OUTSIDE_DATA"));
}

{
  const badPort = validateWindowsDeployConfig(validConfig({ PORT: "70000" }));
  assert.equal(badPort.ok, false);
  assert.ok(badPort.errors.some((error) => error.code === "PORT_INVALID"));

  const badHost = validateWindowsDeployConfig(validConfig({ BIND_HOST: "1.2.3.4" }));
  assert.equal(badHost.ok, false);
  assert.ok(badHost.errors.some((error) => error.code === "BIND_HOST_NOT_ALLOWED"));
}

{
  const lanHttp = validateWindowsDeployConfig(validConfig({
    AUTH_COOKIE_SECURE: "false",
    HTTPS_TERMINATED: "false",
  }));
  assert.equal(lanHttp.ok, true);
  assert.ok(lanHttp.warnings.some((warning) => warning.code === "HTTPS_NOT_TERMINATED"));

  const httpsWithoutSecure = validateWindowsDeployConfig(validConfig({ AUTH_COOKIE_SECURE: "false" }));
  assert.equal(httpsWithoutSecure.ok, false);
  assert.ok(httpsWithoutSecure.errors.some((error) => error.code === "COOKIE_SECURE_REQUIRED_FOR_HTTPS"));
}

{
  const scriptsDir = path.join(__dirname, "scripts", "windows");
  const startScript = fs.readFileSync(path.join(scriptsDir, "start-huashu.ps1"), "utf8");
  const stopScript = fs.readFileSync(path.join(scriptsDir, "stop-huashu.ps1"), "utf8");
  assert.match(startScript, /windows-deploy-check\.cjs/);
  assert.match(startScript, /AUTH_DB_PATH/);
  assert.match(stopScript, /Get-NetTCPConnection/);
  assert.match(stopScript, /AppDir/);
  assert.match(stopScript, /Get-CimInstance/);
  assert.match(stopScript, /应用目录/);
  assert.doesNotMatch(startScript, /ZAI_API_KEY\s*=/i);
  assert.doesNotMatch(startScript, /Write-Output\s+\$env:ZAI_API_KEY/i);
  assert.doesNotMatch(stopScript, /Remove-Item\s+-Recurse/i);
}

{
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-windows-check-"));
  const configSecret = "file-secret-must-not-print";
  fs.writeFileSync(path.join(appDir, ".env.local"), `ZAI_API_KEY=${configSecret}\nZHIPU_MODEL=glm-5.3\n`, { mode: 0o600 });
  const env = {
    ...process.env,
    NODE_ENV: "production",
    NODE_VERSION: "22.15.1",
    APP_DIR: appDir,
    AUTH_DB_PATH: path.join(path.dirname(appDir), "huashu-data", "auth.sqlite"),
    AUTH_REQUIRED: "true",
    AUTH_COOKIE_SECURE: "true",
    HTTPS_TERMINATED: "true",
    BIND_HOST: "0.0.0.0",
    PORT: "3102",
  };
  delete env.ZAI_API_KEY;
  const result = childProcess.spawnSync(process.execPath, [path.join(__dirname, "scripts", "windows-deploy-check.cjs")], {
    cwd: appDir,
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /API 配置: 已配置/);
  assert.doesNotMatch(result.stdout, new RegExp(configSecret));
  fs.rmSync(appDir, { recursive: true, force: true });
}

console.log("test-windows-deploy-config: ok");
