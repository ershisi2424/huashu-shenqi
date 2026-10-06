# Agent Browser 回归冒烟适配设计

## 目标

提供一个可选的、无凭据的真实浏览器启动冒烟器：在独立临时服务已经启动并通过 preflight 后，创建隔离 `agent-browser` session，打开登录页、等待页面加载、确认仍在目标 origin，并在结束时关闭 session。它验证浏览器驱动接入和登录页可达性，不伪造登录、审批或 AI 调用通过。

## 安全边界

- 所有环境校验先经过 `assertSafeBrowserRegressionEnv`；因此 3102、正式 DB、非回环地址、provider key 和 Cookie 会在浏览器启动前被拒绝。
- 需要显式设置 `BROWSER_REGRESSION_EXECUTE=true` 才允许启动外部浏览器；默认只输出 `BROWSER_RUNNER_NOT_ENABLED`，避免误触发。
- 仅向 `agent-browser` 传入 session 名称和登录页 URL，不传递密码、Cookie、API Key、storage state 或用户手机号。
- stdout/stderr 只输出步骤名、目标 origin、稳定错误码；浏览器快照不回显到日志。
- session 使用随机隔离名称，finally 中执行 close；浏览器工具缺失时返回稳定 `AGENT_BROWSER_NOT_FOUND`。

## 冒烟断言

1. `open BASE_URL/login/` 成功。
2. `wait --load networkidle` 成功。
3. `get url` 仍以 preflight 的 origin 开头，不能跳转到其他 origin。
4. 关闭 session 成功或记录可审计的关闭错误。

这不是完整业务回归。账号审批、聊天刷新、乱序响应、运营只读和超级管理员只读仍由后续真实浏览器场景执行。
