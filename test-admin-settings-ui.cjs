const assert = require("node:assert/strict");
const fs = require("node:fs");

const component = fs.readFileSync(`${__dirname}/components/admin/ServiceSettingsWorkspace.js`, "utf8");
const nav = fs.readFileSync(`${__dirname}/components/admin/AdminNav.js`, "utf8");
const page = fs.readFileSync(`${__dirname}/pages/admin/settings.js`, "utf8");
const styles = fs.readFileSync(`${__dirname}/components/admin/admin.module.css`, "utf8");

for (const token of ["/api/admin/settings/", "/api/admin/settings/test/", "服务配置", "API Key", "glm-5.3", "接口地址", "账号类型", "GLM Coding Plan", "保存配置", "测试调用", "super_admin"]) {
  assert(component.includes(token), `设置页缺少契约：${token}`);
}
for (const token of ["active === \"settings\"", "/admin/settings/", "role === \"super_admin\""]) assert(nav.includes(token), `后台导航缺少服务配置契约：${token}`);
for (const token of ["ServiceSettingsWorkspace", "服务配置"]) assert(page.includes(token), `服务配置页面缺少契约：${token}`);
for (const token of ["settingsPage", "settingsLayout", "settingsPanel", "settingsStatus", "settingsNotice", "settingsError", "settingsField", "settingsActionRow"]) assert(styles.includes(token), `服务配置样式缺少契约：${token}`);
assert(component.includes("不返回 API Key"), "设置页应明确密钥不会返回");
assert(component.includes("aria-busy"), "设置页应提供处理中状态");
assert(component.includes('const [access, setAccess] = useState("checking")'), "设置页应显式维护管理员权限状态");
assert(component.includes('access !== "granted"'), "设置页未授权时不应渲染可操作配置表单");
assert(component.includes("正在跳转到登录页"), "未登录状态应明确提示跳转，而不是留下无响应表单");
assert(component.includes("response.status === 401"), "设置接口会话过期时应回到登录流程");
assert(component.includes("返回登录"), "登录跳转失败时应提供可见的返回登录入口");
assert(component.includes("upstreamStatus"), "测试失败时应显示脱敏上游状态诊断");
assert(component.includes("upstreamCode"), "测试失败时应显示脱敏上游错误码诊断");
assert(component.includes("apiMode"), "设置页应明确区分智谱账号类型与接口端点");
assert(component.includes("api/coding/paas/v4"), "设置页应提供 Coding Plan 专用端点");
assert(component.includes("api/paas/v4"), "设置页应提供资源包/充值余额通用端点");
console.log("test-admin-settings-ui: contract passed");
