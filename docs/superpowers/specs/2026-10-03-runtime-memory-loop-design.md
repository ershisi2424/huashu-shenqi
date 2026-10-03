# Runtime 长期记忆闭环设计

日期：2026-10-03

## 目标

补齐当前 `goutoujunshi` Runtime 的长期记忆闭环：主播可以手动确认少量、可解释的维护对象记忆；启用并同意后，下一轮 Runtime 才能读取这些条目作为背景证据；暂停、撤销或清除后立即停止使用。系统不自动把聊天原文写入长期记忆，也不因为姓名、性别、MBTI 或单条消息推断敏感属性。

## 非目标

- 不读取或登录抖音后台。
- 不自动发送私信、礼物或消费请求。
- 不把 AI 推测自动保存成稳定事实。
- 不在记忆中保存 API Key、会话 Cookie、完整聊天 transcript 或命名空间 ID。
- 不向运营或超级管理员开放记忆写入权限。

## 方案

### 数据流

```text
主播打开对象
  -> 读取对象级 memory status + items
  -> 主播明确启用（consent=true）
  -> 主播手动填写/确认一条记忆
  -> 服务端校验 scope/source/confidence/长度
  -> 下一次 profile 请求读取同一主播 + 同一维护对象的 active items
  -> Runtime 将 confirmed memory 作为背景证据，hypothesis 仅作为低置信度推测
  -> GLM-5.3 仅收到脱敏记忆条目和当前 Runtime 状态
```

### 记忆字段

沿用现有 SQLite 表和权限边界：

- `scope`: `user`、`object`、`relationship`、`hypothesis`
- `field`: 由主播填写的短字段名，例如 `interest`、`preferred_topic`
- `value`: 由主播确认的短文本
- `sourceType`: `user_explicit` 或 `user_report` 才能产生稳定对象/关系条目；`assistant_inference` 只能写入 `hypothesis`
- `confidence`: `low`、`medium`、`high`
- `occurredAt`: 可选日期

当前存储层已有同意、暂停、恢复、撤销、忘记对象、回滚和对象隔离；本阶段只补读取适配和 UI 手动确认，不重做表结构。

### Runtime 读取契约

`memoryAdapter` 增加可选 `context({ actor, brotherId })` 方法。Runtime 先读取状态：

- 未启用：`items=[]`，不进入 prompt，不参与事实/目标判断。
- 已暂停：`items=[]`，保留状态但不进入 prompt。
- 已启用：读取服务端 active items，转换为不含 `namespace`、用户 ID、对象 ID、`sourceRef` 的 `memory.items`。

Runtime 输出增加：

```js
memory: {
  status: "not_enabled" | "enabled" | "paused",
  items: [{ scope, field, value, sourceType, confidence, occurredAt }],
  changes: [],
  reversible: true
}
```

`object`、`relationship`、`user` 条目进入背景事实；`hypothesis` 条目只进入 `inferences`，不得升级为事实。当前消息、当前授权素材和显式拒绝始终优先于记忆中的旧背景。

### GLM 边界

只有状态为 `enabled` 且存在主播手动确认条目时，`promptContext.memory.items` 才出现内容。提示词明确说明：

- 记忆是背景参考，不是当前事实的替代品。
- `hypothesis` 只能保守参考，不能输出人格或敏感属性结论。
- 旧记忆与当前消息冲突时保留未知并以当前消息为准。

禁用、暂停、撤销后的请求不应包含记忆值；测试会检查 prompt 中不存在已清除条目的值。

## 界面

在聊天页“本轮判断依据”中增加对象级记忆区域：

- 状态：默认关闭 / 已启用 / 已暂停。
- 主播操作：明确同意启用、暂停、恢复、撤销并清除。
- 手动确认表单：范围、字段、内容、可信度；来源固定显示为“主播明确确认”。
- 条目列表：显示 scope、field、value、confidence 和时间；支持用同一字段再次确认更新。
- 说明：这些条目可能作为背景发送给已配置的 GLM-5.3；不保存整段聊天原文。

运营和超级管理员在只读工作台只能看到分析中是否使用了记忆及摘要，不显示写入按钮，不允许修改主播记忆。

## API 与错误处理

沿用 `/api/chat/runtime-memory/`：

- `GET` 返回 `{ status, items }`。
- `POST action=enable` 必须 `consent=true`。
- `POST action=apply` 只接受服务端允许的来源/范围，并返回新增或更新后的 item。
- `pause/resume/revoke/forget-object/undo` 保留现有语义。
- 跨主播、非主播写入、对象不存在继续返回现有 403/400 错误码。

AI 请求失败时不写入长期记忆；记忆读取失败时 profile 请求安全失败，不降级为读取其他主播或其他对象的记忆。

## 测试验收

1. Runtime：禁用、暂停、撤销时不输出 memory items；启用时只输出当前对象条目。
2. Runtime：确认条目进入 facts，hypothesis 进入 inferences，且没有 namespace/ID。
3. API：主播必须显式 consent 才能 enable/apply；运营和其他主播不能写入。
4. API：同名维护对象跨主播隔离，撤销后 GET 和下一次 profile prompt 均不含旧值。
5. Profile：启用记忆时 GLM 请求可看到脱敏条目；未启用时看不到记忆值。
6. UI：刷新对象后状态和条目可恢复；提交、暂停、撤销均有 loading/success/error 反馈。
7. 回归：现有 `npm test`、`npm run test:runtime`、上游 `validate_skill.py` 和隔离副本生产构建继续通过。

