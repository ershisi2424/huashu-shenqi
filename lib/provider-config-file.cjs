const fs = require("node:fs");
const path = require("node:path");
const {
  DEFAULT_PROVIDER_BASE_URL,
  DEFAULT_PROVIDER_MODEL,
  validateProviderConfigFields,
} = require("./windows-installer-config.cjs");

const CONFIG_VERSION = 1;

function configError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function normalizePath(filePath) {
  if (typeof filePath !== "string" || !filePath.trim()) configError("PROVIDER_CONFIG_PATH_REQUIRED", "Provider 配置路径不能为空");
  return path.resolve(filePath);
}

function validateStoredValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) configError("PROVIDER_CONFIG_INVALID", "Provider 配置必须是对象");
  if (value.version !== undefined && value.version !== CONFIG_VERSION) configError("PROVIDER_CONFIG_VERSION_UNSUPPORTED", "Provider 配置版本不支持");
  return validateProviderConfigFields({
    ZAI_API_KEY: value.ZAI_API_KEY,
    ZHIPU_MODEL: value.ZHIPU_MODEL,
    ZHIPU_BASE_URL: value.ZHIPU_BASE_URL,
  });
}

function readProviderConfig(filePath) {
  const target = normalizePath(filePath);
  let text;
  try {
    text = fs.readFileSync(target, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { ZAI_API_KEY: "", ZHIPU_MODEL: DEFAULT_PROVIDER_MODEL, ZHIPU_BASE_URL: DEFAULT_PROVIDER_BASE_URL };
    throw error;
  }
  let parsed;
  try { parsed = JSON.parse(text); } catch { configError("PROVIDER_CONFIG_JSON_INVALID", "Provider 配置不是有效 JSON"); }
  return validateStoredValue(parsed);
}

function replaceFileAtomically(target, content) {
  // 先写同目录临时文件、fsync 后 rename，避免服务重启时读到半截 JSON。
  // Windows ACL 由安装脚本设置；这里的 chmod 仅作为 Unix 开发环境的最小权限兜底。
  const parent = path.dirname(target);
  fs.mkdirSync(parent, { recursive: true });
  const temp = path.join(parent, `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);
  let handle;
  try {
    handle = fs.openSync(temp, "wx", 0o600);
    fs.writeFileSync(handle, content, "utf8");
    try { fs.fsyncSync(handle); } catch { /* Some Windows filesystems do not expose fsync. */ }
    fs.closeSync(handle);
    handle = undefined;
    fs.renameSync(temp, target);
  } catch (error) {
    if (handle !== undefined) {
      try { fs.closeSync(handle); } catch { /* best effort */ }
    }
    try { fs.rmSync(temp, { force: true }); } catch { /* best effort */ }
    throw error;
  }
}

function writeProviderConfig(filePath, input = {}) {
  // 只返回脱敏配置；API Key 永远不回传给浏览器、日志或管理员页面。
  const target = normalizePath(filePath);
  const validated = validateProviderConfigFields(input);
  const serialized = `${JSON.stringify({ version: CONFIG_VERSION, ...validated }, null, 2)}\n`;
  replaceFileAtomically(target, serialized);
  try { fs.chmodSync(target, 0o600); } catch { /* Windows ACLs are applied by the installer. */ }
  return maskProviderConfig(validated);
}

function projectProviderEnv(input = {}) {
  const validated = validateStoredValue(input);
  return {
    ZAI_API_KEY: validated.ZAI_API_KEY,
    ZHIPU_MODEL: validated.ZHIPU_MODEL,
    ZHIPU_BASE_URL: validated.ZHIPU_BASE_URL,
  };
}

function maskProviderConfig(input = {}) {
  const validated = validateStoredValue(input);
  return {
    ZAI_API_KEY: validated.ZAI_API_KEY ? "***" : "",
    ZHIPU_MODEL: validated.ZHIPU_MODEL,
    ZHIPU_BASE_URL: validated.ZHIPU_BASE_URL,
  };
}

module.exports = {
  CONFIG_VERSION,
  maskProviderConfig,
  projectProviderEnv,
  readProviderConfig,
  writeProviderConfig,
};
