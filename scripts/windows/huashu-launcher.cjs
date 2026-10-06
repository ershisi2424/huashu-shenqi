const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { normalizeInstallerConfig, validateProviderConfigFields } = require("../../lib/windows-installer-config.cjs");
const { readProviderConfig, projectProviderEnv } = require("../../lib/provider-config-file.cjs");

// 只继承启动 Node 所需的系统变量；不要把开发机的 API Key、Cookie 或临时会话
// 透传给生产服务。Provider 配置在下方由 ProgramData/provider.json 单独投影。
const INHERITED_OS_KEYS = ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "COMSPEC", "ProgramData", "PROGRAMDATA", "ProgramFiles", "PROGRAMFILES", "USERPROFILE"];

function classifyStartupState({ setupRequired = false, providerConfigured = false } = {}) {
  if (setupRequired) return "SETUP_REQUIRED";
  if (!providerConfigured) return "AI_NOT_CONFIGURED";
  return "READY";
}

function buildChildEnvironment({ appDir, dataDir, port, bindHost, provider = {}, baseEnv = process.env } = {}) {
  // APP_DIR 与 DATA_DIR 必须物理分离：应用版本可以替换，业务库和配置不能随升级删除。
  const config = normalizeInstallerConfig({ appDir, dataDir, port, bindHost });
  const normalizedProvider = validateProviderConfigFields(provider);
  const environment = {};
  for (const key of INHERITED_OS_KEYS) {
    if (typeof baseEnv?.[key] === "string" && baseEnv[key]) environment[key] = baseEnv[key];
  }
  Object.assign(environment, {
    NODE_ENV: "production",
    AUTH_REQUIRED: "true",
    APP_DIR: config.appDir,
    DATA_DIR: config.dataDir,
    AUTH_DB_PATH: config.dbPath,
    AI_REPLY_CONFIG_PATH: path.win32.join(config.configDir, "provider.json"),
    BIND_HOST: config.bindHost,
    HOSTNAME: config.bindHost,
    PORT: String(config.port),
    ZHIPU_MODEL: normalizedProvider.ZHIPU_MODEL,
    ZHIPU_BASE_URL: normalizedProvider.ZHIPU_BASE_URL,
  });
  if (normalizedProvider.ZAI_API_KEY) environment.ZAI_API_KEY = normalizedProvider.ZAI_API_KEY;
  return environment;
}

function readActiveRelease(dataDir) {
  // active-release.json 是升级提交后的唯一入口；解析后再次限制在 releases 目录内，
  // 防止被篡改的指针把服务启动到任意路径。
  const root = path.win32.normalize(String(dataDir || ""));
  if (!/^[A-Za-z]:[\\/]/.test(root)) throw new Error("DATA_DIR_NOT_ABSOLUTE");
  const pointerPath = path.win32.join(root, "active-release.json");
  const pointer = JSON.parse(fs.readFileSync(pointerPath, "utf8"));
  const release = path.win32.normalize(String(pointer.release || ""));
  const releasesRoot = path.win32.resolve(root, "releases");
  if (!release || !path.win32.resolve(release).startsWith(`${releasesRoot}${path.win32.sep}`)) throw new Error("ACTIVE_RELEASE_PATH_INVALID");
  return release;
}

function loadProvider(dataDir) {
  const filePath = path.win32.join(dataDir, "config", "provider.json");
  return projectProviderEnv(readProviderConfig(filePath));
}

function launch({ appDir, dataDir, port = 3102, bindHost = "0.0.0.0", spawnImpl = childProcess.spawn } = {}) {
  // 启动器只负责固定生产环境并托管 standalone server，不在这里执行迁移或写业务数据。
  if (process.platform !== "win32") throw new Error("WINDOWS_RUNTIME_REQUIRED");
  const release = readActiveRelease(dataDir);
  const provider = loadProvider(dataDir);
  const environment = buildChildEnvironment({ appDir: release || appDir, dataDir, port, bindHost, provider });
  const nodeExe = path.win32.join(release || appDir, "runtime", "node.exe");
  const server = path.win32.join(release || appDir, ".next", "standalone", "server.js");
  if (!fs.existsSync(nodeExe) || !fs.existsSync(server)) throw new Error("RELEASE_RUNTIME_MISSING");
  return spawnImpl(nodeExe, [server], { cwd: path.win32.dirname(server), env: environment, stdio: "inherit", windowsHide: true });
}

if (require.main === module) {
  launch({
    appDir: process.env.HUASHU_APP_DIR,
    dataDir: process.env.HUASHU_DATA_DIR,
    port: Number(process.env.HUASHU_PORT || 3102),
    bindHost: process.env.HUASHU_BIND_HOST || "0.0.0.0",
  });
}

module.exports = { buildChildEnvironment, classifyStartupState, launch, loadProvider, readActiveRelease };
