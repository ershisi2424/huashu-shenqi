# 第三方组件与制品说明

下面是 Windows 发布包会携带或依赖的主要组件。正式发布前应在 CI 归档实际版本、来源 URL、许可证文本和 SHA-256；本文件不替代各组件的原始许可证。

| 组件 | 用途 | 发布核对 |
| --- | --- | --- |
| Node.js 22 LTS | Windows 运行时 | 使用官方 x64 发行包并核对许可证与 SHA-256 |
| Next.js 16.3.3 | Web 服务框架 | 由 `package-lock.json` 锁定 |
| React 19.2.8 | Web UI | 由 `package-lock.json` 锁定 |
| better-sqlite3 13.0.3 | SQLite 驱动 | 必须包含并验证 `win32-x64.node` |
| WinSW 2.x | Windows 服务包装器 | 归档实际二进制、许可证和 SHA-256 |
| NSIS | 安装器构建工具 | 构建机固定版本，安装器本身必须 Authenticode 签名 |
| goutoujunshi | 本地核心算法参考 | `vendor/goutoujunshi` 使用锁定 revision，保留上游许可证 |

安装包不得携带 API Key、密码、Cookie、SQLite 数据库、会话 Token、日志、上传内容或聊天历史。业务数据和 Provider 配置位于 `C:\ProgramData\Huashu`，卸载默认保留。内部未签名制品必须显式显示 `INTERNAL_UNVERIFIED`，不得对外宣称已签名或商用可用。
