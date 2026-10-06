# Windows 10 生产发布清单

这份清单是联网引导安装包的放行门禁。源码构建、macOS 静态测试和本地 Next.js 页面可用，不等于 Windows 10 生产发布已验收；下列 Windows 项目必须在目标或等价干净机器完成。

## 放行前置条件

- Windows 10 x64，Node.js 22 LTS，管理员 PowerShell，Windows 防火墙规则已由运营方确认。
- 发布清单声明 `win32/x64`、HTTPS 下载地址、版本号、文件大小和 SHA-256；下载脚本拒绝 HTTP、路径穿越和部分文件。
- `better-sqlite3` 的 `win32-x64.node` 已进入发布目录，并完成 `PRAGMA integrity_check` 原生烟测。
- 安装器 EXE 经过 SHA-256 校验。生产发布必须通过 Authenticode；内部联调包必须明确标记 `INTERNAL_UNVERIFIED`，不得标成已签名。
- 签名证书、发布清单和制品地址来自受控 CI/制品库，不把 API Key、密码、Cookie、SQLite、日志或聊天记录放进安装包。

## 构建与校验

1. 在干净 checkout 执行 `npm ci`、`npm test`、`npm run build`。
2. 运行 `node scripts/windows/build-release.cjs --source . --output <release-dir>`；随后运行 `node scripts/windows/verify-release.cjs <release-dir>`。
3. 在 Windows 上运行 `scripts/windows/package-release.ps1`。必须提供 HTTPS `ArtifactBaseUrl` 和完整 `ManifestPath`；缺一项立即失败。
4. 运行 `scripts/windows/verify-package.ps1`，核对 EXE SHA-256、x64 架构、Authenticode 状态和原生模块。没有签名的内部包只允许显示 `INTERNAL_UNVERIFIED`。
5. 将 `package-manifest.json`、`release-manifest.json` 和 SHA-256 记录一并归档。

## 首次安装与初始化

1. 以管理员运行安装器，应用版本落在 `C:\Program Files\Huashu\releases\<version>`，业务数据落在 `C:\ProgramData\Huashu`。
2. 安装器注册自动启动服务并创建受保护的 `config`、`data`、`logs`、`backups`、`cache`、`releases` 目录。
3. 仅在服务器本机打开 `/setup/`，输入安装器输出的一次性初始化码；初始化码不写入日志或接口响应，15 分钟过期且连续失败会锁定。
4. 超级管理员首次登录后，在后台服务配置页保存 Provider 配置。配置文件只允许 API Key、模型和 Provider 地址，接口只返回脱敏状态。

## 局域网与服务验收

- 本机访问 `http://127.0.0.1:<port>/login/`，局域网客户端访问 `http://<LAN-IP>:<port>/login/`。
- 认证开启、HTTP-only Cookie 生效、未登录访问工作台被拒绝；超级管理员、运营、主播、游客权限按角色测试。
- 服务停止/启动、Windows 重启自动启动、日志轮转、端口冲突和防火墙最小开放范围均有记录。
- `scripts/windows/repair.ps1` 可在不删除 `C:\ProgramData\Huashu` 的情况下完成发布校验与配置检查。

## 数据、升级、修复与卸载

- 升级前先执行 SQLite 备份并保存 SHA-256；在候选目录迁移，验证通过后才切换活动版本。
- 升级中断时运行 `recover-install.ps1`，确认旧版本仍可启动；候选失败目录不得覆盖活动数据库。
- 修复只替换应用版本或服务注册，不删除认证库、Provider 配置、业务聊天数据和备份。
- 卸载脚本停止并移除服务、删除应用目录，但明确保留 `C:\ProgramData\Huashu`；重新安装可恢复原数据。
- 备份恢复后重新执行完整权限、登录、AI 配置脱敏和聊天隔离测试。

## 稳定错误码与放行结论

重点记录 `PACKAGE_CONFIG_REQUIRED`、`SHA256_MISMATCH`、`SIGNATURE_REQUIRED`、`WINDOWS_NATIVE_MODULE_MISSING`、`WINDOWS_NATIVE_SMOKE_FAILED`、`WINDOWS_RUNTIME_HTTP_SMOKE_FAILED` 和 `UNINSTALL_PATH_INVALID`。

只有在 Windows x64 原生烟测、干净机 HTTP 烟测、服务自动启动、升级回滚、卸载保留数据、签名和防火墙验收均有证据时，才可以把包标为生产可发布。否则只能标记为 `INTERNAL_UNVERIFIED` 或 `PENDING_WINDOWS_VALIDATION`。
