# 回复历史 Runtime 上下文持久化设计

## 目标

让每一批 AI 候选回复与生成当时的 `goutoujunshi Runtime` 状态绑定保存。恢复历史候选时，同时恢复事实、未知项、主目标、风险边界、资料补全状态、开场话题和直播邀请，避免页面刷新后候选与当前大哥消息错配，或只恢复文本而丢失生成依据。

## 约束

- 继续沿用当前主播/运营/超级管理员的聊天对象权限和 `sourceMessageId` 绑定，不放宽跨主播读取。
- 不改变 AI 生成协议，不在浏览器直连模型；历史接口只保存服务端已经确认的 Runtime 输出。
- 访客仍只写入自己的 localStorage 命名空间，登录用户写入现有 SQLite 账号库。
- 旧数据库必须通过版本化迁移升级；旧历史没有新字段时安全返回 `null`/空数组。
- 所有字段限长、JSON 解析失败时降级，不因一条坏历史阻塞聊天页面。

## 数据流

```text
生成响应
  -> ChatWorkspace 当前状态
  -> workspace snapshot（已有）
  -> reply_history（新增 Runtime 列）
  -> GET/guest local history
  -> 恢复候选 + 恢复完整 Runtime 状态
```

## 存储字段

`reply_history` 新增：

- `runtime_analysis_json`：事实、未知项、主目标、情绪与停止条件。
- `runtime_intake_json`：资料补全问题与需要的输入。
- `runtime_json`：运行时名称、版本/修订与来源元数据。
- `opening_topics_json`：本轮可自然承接的话题。
- `live_invite_json`：本轮人工可选的直播内容邀请；默认 `null`。

访客历史对象使用同名 camelCase 字段，和候选草稿/Workspace snapshot 保持一致。

## 恢复语义

恢复一条历史时：

1. 恢复候选文本、回复风格、画像、决策和算法核心。
2. 恢复 Runtime 五组字段。
3. 将历史的 `sourceMessageId` 重新选为当前对象消息，避免把候选显示在另一个消息下。
4. 清空主播编辑框，让主播显式选择候选后再发送。
5. 保留现有权限、错误清理和人工最终确认边界。

## 验收标准

- SQLite 新库记录 `0003.reply-history-runtime-context`，旧库可幂等升级。
- POST/GET 回复历史往返后五组 Runtime 字段值不丢失。
- 登录用户刷新后恢复历史候选可同时恢复 Runtime 面板；访客本地历史同样可恢复。
- 越权、未确认消息和跨维护对象边界测试继续通过。
- 全量 `npm test`、`git diff --check` 和隔离生产构建通过。
