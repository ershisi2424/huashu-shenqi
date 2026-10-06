# 数据库结构（当前实现）

默认文件为 `data/auth.sqlite`，生产路径通过 `AUTH_DB_PATH` 指定。当前所有表均在同一 SQLite 数据库，账号和维护对象通过外键与归属字段隔离。

## 身份与安全

- `users`：`id`、手机号、名称、角色（`super_admin`/`operator`/`anchor`）、状态、运营归属、审批人和时间戳。
- `sessions`：会话 token 哈希、用户、过期时间、创建时间。
- `guest_accounts`：临时游客匿名 ID、手机号 HMAC、最后活动和过期时间。
- `guest_sessions`：游客会话 token 哈希、游客 ID、最后活动、过期和撤销时间。
- `guest_secrets`：游客手机号 HMAC 服务端秘密；部署时应使用外部秘密配置并限制数据库文件权限。
- `audit_logs`：操作者、动作、目标、脱敏元数据和快照。
- `delete_confirmations`：二次删除确认短期票据。

## 聊天与生成

- `chat_brothers`：维护对象、主播 owner、运营归属、昵称和备注。
- `chat_messages`：消息正文、发送方、状态、来源、对象、操作者和时间；候选来源必须是当前对象下 `sender=brother,status=confirmed` 的记录。
- `workspace_snapshots`：当前草稿、候选、画像和生成上下文；以维护对象为唯一更新范围。
- `reply_history`：每次候选生成批次、来源消息、回复风格、候选、画像和 Runtime 结果。
- `maintenance_tasks`：跟进任务、状态、优先级、来源消息、幂等 `request_id` 和时间。
- `relationship_events`：关系时间线事件。
- `operator_notes`：运营对主播工作台的内部点评。

## 运行与记忆

- `ai_usage_events`：provider/model、操作、状态、错误码、耗时和关联对象；不保存 API Key 或请求正文。
- `goutoujunshi_memory_settings`：账号/对象范围的记忆开关。
- `goutoujunshi_memories`：授权的结构化长期记忆。
- `goutoujunshi_memory_operations`：记忆读取、写入和删除审计。

## 迁移与备份状态

- `schema_migrations` 已作为启动时的版本账本创建，当前迁移为 `0001.auth-store-baseline` 和 `0002.password-reset-tokens`。已有数据库会在当前 schema 初始化完成后采用基线，并应用后续受控迁移；后续 schema 变更必须以新的唯一 migration id、描述和 checksum 注册，不允许复用已应用 id 覆盖定义。
- `lib/db-migrations.cjs` 提供 checksum 校验、幂等应用、重复 id 检查和 ledger 查询；checksum 不一致会阻止启动，避免同一版本静默变更。
- `scripts/db-backup.cjs` / `npm run db:backup -- --output <path>` 使用 SQLite 在线 backup API 生成一致性副本，默认拒绝覆盖已有目标；副本会执行 `PRAGMA integrity_check` 并校验迁移账本后才报告成功。源库只读打开，脚本不会清理或改写源库。
- `scripts/db-restore-verify.cjs` / `npm run db:restore:verify -- --source <backup> --destination <new-path>` 只恢复到不存在的新路径，验证迁移账本、完整性和关键记录；没有覆盖或生产切换参数。
- 已覆盖自动化测试：基线初始化/重开幂等、migration checksum 冲突拒绝、备份完整性、恢复到新路径、覆盖保护和源库不变。尚未完成的是 Windows 10 实机定时备份、异地/加密存储、生产恢复切换和升级回滚；这些仍是生产准入项。

## 密码恢复令牌

- `password_reset_tokens` 只保存 `token_hash`、目标用户、发起管理员、过期时间、创建时间和消费时间；原始 token 只在管理员发起接口响应中出现一次。
- 令牌由活动超级管理员发起，目标限定为运营/主播账号；消费接口不接受手机号或账号枚举式申请。成功消费在同一事务内更新密码、标记令牌已使用、撤销目标账号全部会话并写入审计。
- 令牌表的目标用户和发起管理员均为级联外键，账号删除时不会留下可消费的恢复令牌。
