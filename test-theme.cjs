const assert = require("node:assert/strict");
const { THEME_STORAGE_KEY, normalizeTheme, resolveTheme } = require("./lib/theme.cjs");

assert.equal(THEME_STORAGE_KEY, "hh_theme");
assert.equal(normalizeTheme("dark"), "dark");
assert.equal(normalizeTheme("light"), "light");
assert.equal(normalizeTheme("unknown"), "system");
assert.equal(resolveTheme("system", true), "dark");
assert.equal(resolveTheme("system", false), "light");
assert.equal(resolveTheme("dark", false), "dark");

console.log("✅ 主题偏好解析测试通过");
