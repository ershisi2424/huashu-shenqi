# 浏览器回归安全前置设计

## 目标

为下一步真实浏览器回归提供一个可审计、可阻断误操作的前置检查。检查在浏览器驱动启动前执行，确认目标是临时测试服务、临时数据库、强制认证和模拟 AI 环境，不允许误连正在使用的 3102 服务或正式账号库。

## 设计原则

- 默认拒绝：缺少关键变量、目标端口为 3102、数据库位于项目正式数据目录或携带真实 provider key 时立即失败。
- 不启动监听、不读取 Cookie、不读取数据库内容；只解析环境变量和路径元数据。
- 输出只包含安全摘要和稳定错误码，不输出密码、Token、Cookie、手机号或 API Key。
- 允许 macOS 临时目录和 Windows `%TEMP%` 临时目录；数据库必须在项目根目录之外，文件名使用 `auth.sqlite` 或测试专用名称。
- 真实浏览器驱动作为可选外部步骤，不进入默认 `npm test` 的服务启动路径。

## 必填环境

```text
NODE_ENV=test
AUTH_REQUIRED=true
AUTH_COOKIE_SECURE=false
AUTH_DB_PATH=<项目外临时目录>/auth.sqlite
BASE_URL=http://127.0.0.1:<临时端口>
```

`BASE_URL` 的协议、主机和端口会被解析；端口不能是 3102，不能缺失，也不能使用 `file:` 或无效 URL。provider key 和浏览器 Cookie 环境变量必须为空，测试应使用 mock provider。

## 输出契约

成功只输出类似：

```json
{"ok":true,"baseUrl":"http://127.0.0.1:32123","database":"external-temp","authRequired":true,"provider":"mock"}
```

失败只输出 `BROWSER_PREFLIGHT_FAILED <CODE>`，并以非零退出；不回显原始值。

## 后续浏览器步骤

前置通过后，外部浏览器脚本负责登录、审批、聊天保存、刷新恢复、候选来源绑定、乱序响应、账号切换、运营只读和超级管理员只读验证。浏览器脚本必须自行清理临时服务和数据库，并将失败信息限制为页面路径、HTTP 状态和合成标识。
