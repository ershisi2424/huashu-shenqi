const path = require("node:path");

const DEFAULT_PORT = 3102;
const DEFAULT_BIND_HOST = "0.0.0.0";
const DEFAULT_APP_DIR = "C:\\Program Files\\Huashu\\releases\\active";
const DEFAULT_DATA_DIR = "C:\\ProgramData\\Huashu";
const DEFAULT_PROVIDER_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
const DEFAULT_PROVIDER_MODEL = "glm-5.3";
// Provider 字段是唯一允许写入 ProgramData/config/provider.json 的白名单。
// 认证、监听地址、数据库路径等运行时字段必须由启动器固定投影，不能由普通配置表单覆盖。
const PROVIDER_FIELDS = Object.freeze(["ZAI_API_KEY", "ZHIPU_MODEL", "ZHIPU_BASE_URL"]);

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function stringValue(input, key, fallback = "") {
  const value = input && input[key];
  return value === undefined || value === null ? fallback : String(value).trim();
}

function isUncPath(value) {
  return /^\\\\/.test(String(value || ""));
}

function isWindowsAbsolute(value) {
  return /^[A-Za-z]:[\\/]/.test(String(value || ""));
}

function resolveWindowsPath(value, code) {
  const input = stringValue({ value }, "value");
  if (!input) fail(`${code}_REQUIRED`, "路径不能为空");
  if (isUncPath(input)) fail("UNC_PATH_NOT_ALLOWED", "不允许使用 UNC 路径");
  if (!isWindowsAbsolute(input)) fail(`${code}_NOT_ABSOLUTE`, "路径必须是 Windows 绝对路径");
  return path.win32.normalize(input);
}

function isInside(directory, target) {
  const relative = path.win32.relative(path.win32.resolve(directory), path.win32.resolve(target));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.win32.sep}`) && !path.win32.isAbsolute(relative));
}

function normalizePort(value) {
  const text = String(value ?? DEFAULT_PORT).trim();
  if (!/^\d+$/.test(text)) fail("PORT_INVALID", "端口必须是整数");
  const port = Number(text);
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail("PORT_INVALID", "端口必须在 1 到 65535 之间");
  return port;
}

function normalizeInstallerConfig(input = {}) {
  // Windows 版本目录和 ProgramData 数据目录必须分离，保证升级/卸载不会误删账号与聊天数据。
  const appDir = resolveWindowsPath(stringValue(input, "appDir", DEFAULT_APP_DIR), "APP_DIR");
  const dataDir = resolveWindowsPath(stringValue(input, "dataDir", DEFAULT_DATA_DIR), "DATA_DIR");
  if (isInside(appDir, dataDir) || isInside(dataDir, appDir)) {
    fail("DATA_DIR_INSIDE_APP", "数据目录必须与应用目录分离");
  }
  const bindHost = stringValue(input, "bindHost", DEFAULT_BIND_HOST).toLowerCase();
  if (!["0.0.0.0", "127.0.0.1", "localhost", "::", "[::]", "::1"].includes(bindHost)) {
    fail("BIND_HOST_NOT_ALLOWED", "绑定地址只能是受支持的本机或局域网地址");
  }
  const port = normalizePort(input.port);
  const paths = {
    appDir,
    dataDir,
    configDir: path.win32.join(dataDir, "config"),
    dbDir: path.win32.join(dataDir, "data"),
    dbPath: path.win32.join(dataDir, "data", "auth.sqlite"),
    logsDir: path.win32.join(dataDir, "logs"),
    backupsDir: path.win32.join(dataDir, "backups"),
    cacheDir: path.win32.join(dataDir, "cache"),
    releasesDir: path.win32.join(dataDir, "releases"),
  };
  return Object.freeze({ ...paths, port, bindHost });
}

function validateProviderConfigFields(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("PROVIDER_CONFIG_INVALID", "Provider 配置必须是对象");
  }
  for (const key of Object.keys(input)) {
    if (!PROVIDER_FIELDS.includes(key)) fail("PROVIDER_FIELD_NOT_ALLOWED", `不允许的 Provider 字段: ${key}`);
  }
  const apiKey = stringValue(input, "ZAI_API_KEY");
  if (apiKey.length > 512 || /[\u0000-\u001f\u007f]/.test(apiKey)) {
    fail("PROVIDER_API_KEY_INVALID", "Provider 密钥格式无效");
  }
  const model = stringValue(input, "ZHIPU_MODEL", DEFAULT_PROVIDER_MODEL);
  if (!/^[A-Za-z0-9._:-]{1,100}$/.test(model)) fail("PROVIDER_MODEL_INVALID", "模型名格式无效");
  const baseUrl = stringValue(input, "ZHIPU_BASE_URL", DEFAULT_PROVIDER_BASE_URL);
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    fail("PROVIDER_BASE_URL_INVALID", "Provider 地址无效");
  }
  const localHttp = parsed.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !localHttp) fail("PROVIDER_BASE_URL_NOT_ALLOWED", "Provider 地址必须使用 HTTPS 或本机 HTTP");
  return Object.freeze({ ZAI_API_KEY: apiKey, ZHIPU_MODEL: model, ZHIPU_BASE_URL: baseUrl.replace(/\/$/, "") });
}

module.exports = {
  DEFAULT_APP_DIR,
  DEFAULT_BIND_HOST,
  DEFAULT_DATA_DIR,
  DEFAULT_PORT,
  DEFAULT_PROVIDER_BASE_URL,
  DEFAULT_PROVIDER_MODEL,
  PROVIDER_FIELDS,
  normalizeInstallerConfig,
  validateProviderConfigFields,
};
