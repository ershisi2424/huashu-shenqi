# 超级管理员 AI 服务配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将智谱 GLM-5.3 配置收拢到超级管理员后台，并让所有 AI 业务统一使用服务端 Provider。

**Architecture:** 新增统一 `lib/ai-provider.cjs` 作为配置和请求边界；新增超级管理员设置与测试调用 API；新增 `/admin/settings/` 页面并从普通聊天页移除写配置能力。现有 OCR 保持本地实现，AI 业务通过 Provider 调用。

**Tech Stack:** Next.js pages router、React、CommonJS 服务端适配层、现有 SQLite 会话鉴权、Node 内置 fetch、现有 CSS Module。

---

### Task 1: Provider 契约和失败测试

**Files:**
- Create: `test-ai-provider.cjs`
- Create: `test-admin-settings-api.cjs`
- Modify: `package.json`

- [ ] 写配置读取、URL 校验、请求体不携带空 Key、脱敏错误映射的失败测试。
- [ ] 写超级管理员 GET/POST/test 权限和响应脱敏失败测试。
- [ ] 将两个测试纳入 `npm test`。
- [ ] 运行测试，确认因 Provider 和新 API 尚不存在而失败。

### Task 2: 统一 Provider

**Files:**
- Create: `lib/ai-provider.cjs`
- Modify: `pages/api/profile.js`
- Modify: `pages/api/health.js`
- Modify: `lib/local-config.cjs`

- [ ] 实现配置读取、校验、脱敏摘要和 GLM-5.3 最小调用。
- [ ] 将 profile 的请求、响应和错误映射改为调用 Provider。
- [ ] 让 health 使用同一配置摘要。
- [ ] 运行 Provider 和既有生成契约测试。

### Task 3: 超级管理员设置 API

**Files:**
- Create: `pages/api/admin/settings.js`
- Create: `pages/api/admin/settings/test.js`

- [ ] 接入 `requireUser(req, res, ["super_admin"])`，开发模式也不绕过角色判断。
- [ ] GET 返回配置状态、模型、脱敏接口地址，不返回 Key。
- [ ] POST 保存 `.env.local`，更新当前进程并返回重启提示。
- [ ] test 调用固定合成请求并返回脱敏结果。
- [ ] 运行权限和错误映射测试。

### Task 4: 后台设置页与导航

**Files:**
- Create: `pages/admin/settings.js`
- Create: `components/admin/ServiceSettingsWorkspace.js`
- Modify: `components/admin/AdminNav.js`
- Modify: `components/admin/admin.module.css`
- Create: `test-admin-settings-ui.cjs`

- [ ] 新增超级管理员可见的服务配置导航和页面。
- [ ] 实现状态、表单、保存、测试调用、加载、成功、失败和移动端布局。
- [ ] 编写 UI 契约测试和样式规则检查。

### Task 5: 收敛普通页面配置入口

**Files:**
- Modify: `pages/index.js`
- Modify: `styles/globals.css`
- Modify: `test-settings.cjs`
- Modify: `test-settings-api.cjs`

- [ ] 删除普通聊天页 API Key 写入表单，保留只读服务状态和跳转提示。
- [ ] 将旧 `/api/settings` 改为拒绝普通用户并兼容迁移到管理员 API，避免绕过权限。
- [ ] 更新契约测试，确认普通页面不再提供保存配置动作。

### Task 6: 全量验证

**Files:**
- Modify: `README.md`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

- [ ] 运行定向测试、全量 `npm test`、`git diff --check`。
- [ ] 运行 UI 静态规则与隔离目录生产构建。
- [ ] 使用无 Key 本机服务确认返回脱敏 `ZAI_API_KEY_MISSING`，不宣称真实调用成功。
- [ ] 更新文档说明配置入口和权限边界。
