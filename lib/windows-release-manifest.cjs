const path = require("node:path");

const MAX_COMPONENT_SIZE = 2 * 1024 * 1024 * 1024;
const VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/;

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function isSafeRelativePath(value) {
  const text = String(value || "");
  if (!text || text.includes("\0") || path.win32.isAbsolute(text) || path.posix.isAbsolute(text) || /^[A-Za-z]:[\\/]/.test(text)) return false;
  const normalized = path.posix.normalize(text.replaceAll("\\", "/"));
  return normalized !== "." && normalized !== ".." && !normalized.startsWith("../") && !normalized.includes("/../") && normalized === text.replaceAll("\\", "/");
}

function validateReleaseManifest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("MANIFEST_INVALID", "版本清单必须是对象");
  if (!VERSION_RE.test(String(input.version || ""))) fail("MANIFEST_VERSION_INVALID", "版本号格式无效");
  if (input.platform !== "win32") fail("MANIFEST_PLATFORM_UNSUPPORTED", "只允许 win32 版本清单");
  if (input.arch !== "x64") fail("MANIFEST_ARCH_UNSUPPORTED", "只允许 x64 版本清单");
  if (!Array.isArray(input.components) || input.components.length === 0) fail("MANIFEST_COMPONENTS_REQUIRED", "版本清单必须包含组件");
  const seen = new Set();
  const components = input.components.map((component, index) => {
    if (!component || typeof component !== "object") fail("COMPONENT_INVALID", `组件 ${index} 无效`);
    const id = String(component.id || "").trim();
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id)) fail("COMPONENT_ID_INVALID", `组件 ${index} 标识无效`);
    if (seen.has(id)) fail("COMPONENT_ID_DUPLICATE", `组件重复: ${id}`);
    seen.add(id);
    let url;
    try { url = new URL(String(component.url || "")); } catch { fail("COMPONENT_URL_INVALID", `组件 ${id} 地址无效`); }
    if (url.protocol !== "https:") fail("COMPONENT_URL_NOT_HTTPS", `组件 ${id} 必须使用 HTTPS`);
    const sha256 = String(component.sha256 || "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sha256)) fail("COMPONENT_SHA256_INVALID", `组件 ${id} 的 SHA-256 无效`);
    const size = Number(component.size);
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_COMPONENT_SIZE) fail("COMPONENT_SIZE_INVALID", `组件 ${id} 大小无效`);
    const relativePath = String(component.relativePath || "");
    if (!isSafeRelativePath(relativePath)) fail("COMPONENT_PATH_TRAVERSAL", `组件 ${id} 路径不安全`);
    const license = String(component.license || "").trim();
    if (!license || license.length > 200) fail("COMPONENT_LICENSE_REQUIRED", `组件 ${id} 缺少许可证信息`);
    return Object.freeze({ id, url: url.toString(), sha256, size, relativePath, license });
  });
  return Object.freeze({ version: String(input.version), platform: "win32", arch: "x64", components });
}

module.exports = { MAX_COMPONENT_SIZE, isSafeRelativePath, validateReleaseManifest };
