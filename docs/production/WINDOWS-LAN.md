# Windows 局域网部署（联网引导安装方案）

这份流程面向单台 Windows 10 局域网服务器。账号认证默认开启，SQLite 数据文件和应用代码分离；启动脚本不会输出服务密钥，也不会替换或删除已有数据库。

## 当前源码契约

安装器固定使用以下目录边界：应用版本位于 `C:\Program Files\Huashu\releases\<version>`，业务数据、认证数据库、Provider 配置、日志、备份和下载缓存位于 `C:\ProgramData\Huashu`。数据目录不得位于应用目录内，也不接受 UNC 路径。

安装器配置只接受 `ZAI_API_KEY`、`ZHIPU_MODEL`、`ZHIPU_BASE_URL` 三个 Provider 字段；`AUTH_REQUIRED`、`PORT`、`NODE_OPTIONS` 等运行时字段不能写入 Provider 配置。Provider 地址必须为 HTTPS，只有本机调试地址允许 HTTP。版本清单只接受 `win32/x64`、HTTPS 下载地址、64 位 SHA-256、有限大小和安全相对路径。

## 当前可执行流程

1. 安装 Node.js 22 LTS，确认 `node --version` 满足 `>=22.0.0`。
2. 将生产构建放到固定版本目录，例如 `C:\Huashu\releases\1.0.0`；运行 `npm ci`，然后运行 `npm run build`。
3. 创建独立的 `C:\ProgramData\Huashu`，设置 `DATA_DIR=C:\ProgramData\Huashu`、`AUTH_DB_PATH=C:\ProgramData\Huashu\data\auth.sqlite`、`AUTH_REQUIRED=true`。API Key 只允许由后续服务启动器从 ProgramData 的受保护 Provider 配置注入，不能写进脚本、前端或 URL。
4. 先执行 `powershell -ExecutionPolicy Bypass -File .\scripts\windows\start-huashu.ps1 -AppDir C:\Huashu\releases\1.0.0 -DataDir C:\ProgramData\Huashu -Port 3102 -BindHost 0.0.0.0`。脚本会调用 `scripts/windows-deploy-check.cjs`，校验 Node 版本、生产认证、数据库路径、端口和绑定地址后才进入前台服务。
5. 局域网客户端访问 `http://<服务器局域网IP>:3102/login/`，仅通过账号登录。停止时先运行 `powershell -ExecutionPolicy Bypass -File .\scripts\windows\stop-huashu.ps1 -AppDir C:\Huashu\app -Port 3102` 查看监听进程；只有确认 PID 属于本应用后再追加 `-Force`。
6. 用 Windows 防火墙只开放局域网网段端口；生产环境应在反向代理启用 HTTPS，并将 Cookie Secure 配置与代理终止方式一致。

## 启动前校验

也可以在不启动服务的情况下执行：

```powershell
$env:NODE_ENV = "production"
$env:AUTH_REQUIRED = "true"
$env:AUTH_DB_PATH = "C:\Huashu\data\auth.sqlite"
$env:ZAI_API_KEY = "由服务账户安全注入"
node .\scripts\windows-deploy-check.cjs
```

成功只表示配置契约通过，不表示外部模型权限、Windows 防火墙、HTTPS 或浏览器链路已经验收。校验输出只显示状态码和非敏感配置摘要，不显示 API Key、Cookie 或请求正文。

## 备份与运行

停止服务或使用 `npm run db:backup -- --source C:\Huashu\data\auth.sqlite --output C:\Huashu\backup\auth-<timestamp>.sqlite` 生成 SQLite 在线备份，同时保留时间戳和校验值；不要复制正在写入的 WAL 文件作为独立备份。升级前先备份、在副本执行迁移、通过验证后再切换，保留可回滚目录。

## 未验收边界

当前没有 Windows 实机、服务管理器、HTTPS 反向代理、防火墙规则、断电恢复和升级回滚证据；本地 macOS 独立副本构建和脚本静态契约通过不等于 Windows 部署完成。联网下载、Node 运行时、better-sqlite3 Windows 原生模块、服务注册、安装器和升级回滚会在后续任务中分别验证；在目标机验收前不把 Windows EXE 标记为已完成。
