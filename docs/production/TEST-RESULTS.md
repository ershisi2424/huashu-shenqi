# Windows 部署验证结果

## 源码侧（当前 macOS worktree）

- `npm test`：113 项验证全部通过。
- `npm run build`：Next standalone 构建退出 0。
- `test-windows-installer-config.cjs`、`test-windows-deploy-config.cjs`：通过。
- `test-provider-config-file.cjs`、`test-setup-state.cjs`、`test-setup-api.cjs`：通过。
- `test-windows-release.cjs`：通过；非 Windows 明确返回 `WINDOWS_NATIVE_SMOKE_PENDING`。
- `test-windows-download-contract.cjs`、`test-windows-launcher.cjs`、`test-windows-installer-script.cjs`、`test-windows-upgrade.cjs`、`test-windows-ci-contract.cjs`、`test-windows-package-checklist.cjs`：通过。
- `git diff --check`：通过；Windows 交付包脚本要求 HTTPS 制品地址、发布 manifest、SHA-256、x64 声明，并将未签名内部包标记为 `INTERNAL_UNVERIFIED`。

## 尚未宣称完成的 Windows 证据

以下项目必须由 `windows-2022` GitHub Actions 或 Windows 10/11 x64 实机产出日志后，才能标记为通过：

- `better-sqlite3` 的 `win32-x64.node` 实际加载、SQLite 写入和 `PRAGMA integrity_check`。
- NSIS 编译、管理员安装向导、联网 manifest 下载、服务注册和 LocalService ACL。
- 首次 setup 码显示/本机 claim、局域网拒绝 claim、重启后登录和数据持久化。
- 修复、服务停止、候选迁移、断电恢复和卸载后 ProgramData 保留。
- Authenticode 签名、EXE SHA-256 和第三方许可证核对。

## 本阶段结论

源码、Node 合同测试和 standalone 构建已通过；安装包的 Windows PowerShell、NSIS、WinSW、原生 SQLite、签名和干净机网络运行仍为 `PENDING_WINDOWS_VALIDATION`，没有生成或宣称已验收的商用 EXE。

## Provider 边界

CI 使用无 API Key 的合成/基础工作台路径；不会把真实智谱 Key 放入 workflow、artifact、日志、数据库或客户端 bundle。真实 Provider 连通性必须在授权的 Windows 环境中单独验收。
