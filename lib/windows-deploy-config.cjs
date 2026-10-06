const path = require("node:path");

const MIN_NODE_MAJOR = 22;
const DEFAULT_PORT = 3102;
const DEFAULT_BIND_HOST = "127.0.0.1";
const ALLOWED_BIND_HOSTS = new Set(["127.0.0.1", "0.0.0.0", "localhost", "::1", "::", "[::]"]);

function readValue(input, key, fallback = "") {
  const value = input && input[key];
  return value === undefined || value === null ? fallback : String(value).trim();
}

function isTrue(input, key) {
  return readValue(input, key).toLowerCase() === "true";
}

function parseNodeMajor(value) {
  const match = String(value || "").trim().replace(/^v/i, "").match(/^(\d+)(?:\.|$)/);
  return match ? Number.parseInt(match[1], 10) : NaN;
}

function isWindowsAbsolute(value) {
  return /^[a-zA-Z]:[\\/]/.test(String(value || "")) || /^\\\\[^\\]+\\[^\\]+/.test(String(value || ""));
}

function isAbsolutePath(value) {
  return path.isAbsolute(value) || isWindowsAbsolute(value);
}

function pathApiFor(appDir, databasePath) {
  return isWindowsAbsolute(appDir) || isWindowsAbsolute(databasePath) ? path.win32 : path;
}

function isInsideDirectory(directory, target, pathApi) {
  const relative = pathApi.relative(pathApi.resolve(directory), pathApi.resolve(target));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${pathApi.sep}`) && !pathApi.isAbsolute(relative));
}

function error(code, message) {
  return { code, message };
}

function warning(code, message) {
  return { code, message };
}

function validateWindowsDeployConfig(input = process.env) {
  const env = input || {};
  const nodeVersion = readValue(env, "NODE_VERSION", process.versions.node);
  const nodeMajor = parseNodeMajor(nodeVersion);
  const nodeEnv = readValue(env, "NODE_ENV").toLowerCase();
  const appDir = readValue(env, "APP_DIR", process.cwd());
  const dataDir = readValue(env, "DATA_DIR");
  const authDbPath = readValue(env, "AUTH_DB_PATH");
  const providerConfigPath = readValue(env, "AI_REPLY_CONFIG_PATH");
  const authRequiredValue = readValue(env, "AUTH_REQUIRED");
  const authRequired = authRequiredValue ? authRequiredValue.toLowerCase() === "true" : nodeEnv === "production";
  const bindHost = readValue(env, "BIND_HOST", DEFAULT_BIND_HOST);
  const portValue = readValue(env, "PORT", String(DEFAULT_PORT));
  const port = Number.parseInt(portValue, 10);
  // The admin settings page persists the provider secret in a protected local
  // config file and Next loads it on process start. The Windows preflight only
  // receives a boolean from the wrapper, never the secret itself.
  const apiKeyConfigured = Boolean(readValue(env, "ZAI_API_KEY")) || isTrue(env, "CONFIG_FILE_CONFIGURED");
  const cookieSecure = isTrue(env, "AUTH_COOKIE_SECURE");
  const httpsTerminated = isTrue(env, "HTTPS_TERMINATED") || isTrue(env, "HTTPS");
  const errors = [];
  const warnings = [];

  if (nodeEnv !== "production") errors.push(error("NODE_ENV_NOT_PRODUCTION", "NODE_ENV 必须设置为 production"));
  if (!Number.isFinite(nodeMajor) || nodeMajor < MIN_NODE_MAJOR) {
    errors.push(error("NODE_VERSION_UNSUPPORTED", `Node.js 主版本必须 >= ${MIN_NODE_MAJOR}`));
  }
  if (!authRequired) errors.push(error("AUTH_REQUIRED_MUST_BE_TRUE", "生产部署必须启用 AUTH_REQUIRED=true"));
  if (!apiKeyConfigured) errors.push(error("ZAI_API_KEY_MISSING", "服务端未配置 ZAI_API_KEY"));

  if (!authDbPath) {
    errors.push(error("AUTH_DB_PATH_REQUIRED", "必须配置独立的 AUTH_DB_PATH"));
  } else if (!isAbsolutePath(authDbPath)) {
    errors.push(error("AUTH_DB_PATH_NOT_ABSOLUTE", "AUTH_DB_PATH 必须是绝对路径"));
  } else if (isInsideDirectory(appDir, authDbPath, pathApiFor(appDir, authDbPath))) {
    errors.push(error("AUTH_DB_PATH_INSIDE_APP", "AUTH_DB_PATH 不得位于应用代码目录内"));
  }

  if (dataDir && !isAbsolutePath(dataDir)) {
    errors.push(error("DATA_DIR_NOT_ABSOLUTE", "DATA_DIR 必须是绝对路径"));
  }
  if (dataDir && authDbPath && isAbsolutePath(dataDir) && isAbsolutePath(authDbPath)) {
    const dataPathApi = pathApiFor(dataDir, authDbPath);
    if (!isInsideDirectory(dataDir, authDbPath, dataPathApi)) {
      errors.push(error("AUTH_DB_PATH_OUTSIDE_DATA", "AUTH_DB_PATH 必须位于 DATA_DIR 内"));
    }
  }
  if (providerConfigPath && !isAbsolutePath(providerConfigPath)) {
    errors.push(error("AI_REPLY_CONFIG_PATH_NOT_ABSOLUTE", "AI_REPLY_CONFIG_PATH 必须是绝对路径"));
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535 || String(port) !== portValue) {
    errors.push(error("PORT_INVALID", "PORT 必须是 1 到 65535 的整数"));
  }
  if (!ALLOWED_BIND_HOSTS.has(bindHost.toLowerCase())) {
    errors.push(error("BIND_HOST_NOT_ALLOWED", "BIND_HOST 只能使用受支持的本机或全接口地址"));
  }
  if (httpsTerminated && !cookieSecure) {
    errors.push(error("COOKIE_SECURE_REQUIRED_FOR_HTTPS", "HTTPS 部署必须设置 AUTH_COOKIE_SECURE=true"));
  } else if (!httpsTerminated && cookieSecure) {
    warnings.push(warning("COOKIE_SECURE_WITHOUT_HTTPS", "AUTH_COOKIE_SECURE=true 但未声明 HTTPS 终止，客户端可能无法建立会话"));
  }
  if (!httpsTerminated && !cookieSecure && ["0.0.0.0", "::", "[::]"].includes(bindHost.toLowerCase())) {
    warnings.push(warning("HTTPS_NOT_TERMINATED", "局域网明文试用模式未启用 HTTPS；正式环境应在反向代理终止 TLS"));
  }

  const config = {
    nodeVersion,
    nodeMajor: Number.isFinite(nodeMajor) ? nodeMajor : null,
    nodeEnv,
    appDir,
    dataDir: dataDir || null,
    authDbPath: authDbPath || null,
    providerConfigPath: providerConfigPath || null,
    authRequired,
    apiKeyConfigured,
    cookieSecure,
    httpsTerminated,
    bindHost,
    port: Number.isInteger(port) ? port : null,
  };
  return { ok: errors.length === 0, config, errors, warnings };
}

function formatValidationResult(result) {
  const lines = [result.ok ? "Windows 部署配置校验通过" : "Windows 部署配置校验失败"];
  if (result.config) {
    lines.push(`Node.js: ${result.config.nodeVersion}`);
    lines.push(`监听: ${result.config.bindHost}:${result.config.port ?? "?"}`);
    lines.push(`认证: ${result.config.authRequired ? "已启用" : "未启用"}`);
    lines.push(`API 配置: ${result.config.apiKeyConfigured ? "已配置（密钥已隐藏）" : "未配置"}`);
  }
  for (const item of result.errors || []) lines.push(`错误 [${item.code}]：${item.message}`);
  for (const item of result.warnings || []) lines.push(`提示 [${item.code}]：${item.message}`);
  return lines.join("\n");
}

module.exports = {
  ALLOWED_BIND_HOSTS,
  DEFAULT_BIND_HOST,
  DEFAULT_PORT,
  MIN_NODE_MAJOR,
  formatValidationResult,
  parseNodeMajor,
  validateWindowsDeployConfig,
};
