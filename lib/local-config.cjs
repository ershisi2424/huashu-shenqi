const fs = require("fs");
const path = require("path");
const { readProviderConfig, writeProviderConfig } = require("./provider-config-file.cjs");

// 本地 Provider 配置说明：开发环境兼容 .env.local；生产环境优先读取
// AI_REPLY_CONFIG_PATH 指向的 provider.json。这里只负责服务端配置，不把
// ZAI_API_KEY、ZHIPU_MODEL、ZHIPU_BASE_URL。这里不是 Runtime 安全规则，
// 不要把安全边界、聊天素材或 API Key 暴露到浏览器、数据库和日志。

const DEFAULT_MODEL = "glm-5.3";
const STANDARD_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
const CODING_PLAN_BASE_URL = "https://open.bigmodel.cn/api/coding/paas/v4";
const DEFAULT_BASE_URL = STANDARD_BASE_URL;
const CONFIG_KEYS = ["ZAI_API_KEY", "ZHIPU_MODEL", "ZHIPU_BASE_URL"];

function envPath(filePath) {
  return filePath || process.env.AI_REPLY_CONFIG_PATH || path.join(process.cwd(), ".env.local");
}

function isProviderJsonPath(filePath) {
  return path.extname(String(filePath || "")).toLowerCase() === ".json";
}

function readText(filePath) {
  try {
    return fs.readFileSync(/* turbopackIgnore: true */ envPath(filePath), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function normalizeBaseUrl(value) {
  return typeof value === "string"
    ? value.trim().replace(/\/chat\/completions\/?$/i, "").replace(/\/+$/, "")
    : "";
}

function detectEndpointMode(value) {
  const normalized = normalizeBaseUrl(value);
  return normalized === CODING_PLAN_BASE_URL ? "coding_plan" : "standard_api";
}

function validateText(value, name, max) {
  if (typeof value !== "string" || value.length === 0 || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${name}_INVALID`);
  }
  return value.trim();
}

function validateSettings(input = {}) {
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  const model = typeof input.model === "string" ? input.model.trim() : "";
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  if (apiKey && (apiKey.length > 512 || /[\u0000-\u001f\u007f]/.test(apiKey))) throw new Error("ZAI_API_KEY_INVALID");
  if (model) {
    validateText(model, "ZHIPU_MODEL", 80);
    if (!/^[A-Za-z0-9._-]+$/.test(model)) throw new Error("ZHIPU_MODEL_INVALID");
  }
  if (baseUrl) {
    validateText(baseUrl, "ZHIPU_BASE_URL", 300);
    let url;
    try { url = new URL(baseUrl); } catch { throw new Error("ZHIPU_BASE_URL_INVALID"); }
    const localHttp = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && localHttp)) || url.username || url.password) {
      throw new Error("ZHIPU_BASE_URL_INVALID");
    }
  }
  return { apiKey, model, baseUrl };
}

function readLocalConfig(filePath) {
  const target = envPath(filePath);
  if (isProviderJsonPath(target)) {
    const values = readProviderConfig(target);
    return {
      configured: Boolean(values.ZAI_API_KEY),
      model: values.ZHIPU_MODEL || DEFAULT_MODEL,
      baseUrl: normalizeBaseUrl(values.ZHIPU_BASE_URL) || DEFAULT_BASE_URL,
    };
  }
  const values = parseEnv(readText(filePath));
  return {
    configured: Boolean(values.ZAI_API_KEY),
    model: values.ZHIPU_MODEL || DEFAULT_MODEL,
    baseUrl: normalizeBaseUrl(values.ZHIPU_BASE_URL) || DEFAULT_BASE_URL,
  };
}

// Server-only helper: used to preserve an existing secret when the settings
// form intentionally submits an empty API Key. Never include this value in an
// API response or pass it to browser code.
function readStoredApiKey(filePath) {
  const target = envPath(filePath);
  if (isProviderJsonPath(target)) return readProviderConfig(target).ZAI_API_KEY || "";
  const values = parseEnv(readText(filePath));
  return typeof values.ZAI_API_KEY === "string" ? values.ZAI_API_KEY.trim() : "";
}

function writeLocalConfig(input, filePath) {
  const target = envPath(filePath);
  if (isProviderJsonPath(target)) {
    const existing = readProviderConfig(target);
    const validated = validateSettings(input);
    const apiKey = validated.apiKey || existing.ZAI_API_KEY || "";
    const model = validated.model || existing.ZHIPU_MODEL || DEFAULT_MODEL;
    const baseUrl = normalizeBaseUrl(validated.baseUrl || existing.ZHIPU_BASE_URL) || DEFAULT_BASE_URL;
    writeProviderConfig(target, { ZAI_API_KEY: apiKey, ZHIPU_MODEL: model, ZHIPU_BASE_URL: baseUrl });
    return { configured: Boolean(apiKey), model, baseUrl };
  }
  const existingText = readText(target);
  const existing = parseEnv(existingText);
  const validated = validateSettings(input);
  const apiKey = validated.apiKey || existing.ZAI_API_KEY || "";
  if (!apiKey) throw new Error("ZAI_API_KEY_REQUIRED");
  const model = validated.model || existing.ZHIPU_MODEL || DEFAULT_MODEL;
  const baseUrl = normalizeBaseUrl(validated.baseUrl || existing.ZHIPU_BASE_URL) || DEFAULT_BASE_URL;
  validateSettings({ apiKey, model, baseUrl });
  const nextValues = { ZAI_API_KEY: apiKey, ZHIPU_MODEL: model, ZHIPU_BASE_URL: baseUrl };
  const seen = new Set();
  const lines = existingText ? existingText.split(/\r?\n/) : [];
  const output = lines.map((line) => {
    const match = line.match(/^\s*(ZAI_API_KEY|ZHIPU_MODEL|ZHIPU_BASE_URL)\s*=/);
    if (!match) return line;
    const key = match[1];
    seen.add(key);
    return `${key}=${nextValues[key]}`;
  }).filter((line, index, all) => {
    const match = line.match(/^\s*(ZAI_API_KEY|ZHIPU_MODEL|ZHIPU_BASE_URL)\s*=/);
    if (!match) return true;
    return all.indexOf(line) === index || !seen.has(match[1]);
  });
  for (const key of CONFIG_KEYS) {
    if (!seen.has(key)) output.push(`${key}=${nextValues[key]}`);
  }
  fs.writeFileSync(target, `${output.filter((line, index) => index < output.length - 1 || line !== "").join("\n").replace(/\n*$/, "\n")}`, { mode: 0o600 });
  try { fs.chmodSync(target, 0o600); } catch { /* Windows may not support POSIX modes. */ }
  return { configured: true, model, baseUrl };
}

module.exports = {
  DEFAULT_MODEL,
  DEFAULT_BASE_URL,
  STANDARD_BASE_URL,
  CODING_PLAN_BASE_URL,
  detectEndpointMode,
  readLocalConfig,
  readStoredApiKey,
  validateSettings,
  writeLocalConfig,
};
