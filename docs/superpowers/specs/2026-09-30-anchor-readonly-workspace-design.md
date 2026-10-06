# 主播工作台只读查看与最新快照同步设计

日期：2026-09-30  
状态：用户已确认设计，待实现

## 背景与目标

运营和最高管理需要直接进入主播的工作台，查看主播当前正在维护的对象、最新草稿、最新一批 AI 候选、画像分析、`goutoujunshi` 决策和已同步聊天记录。主播手机端的当前工作内容部分存在浏览器内存或本地状态中，管理端无法看见，因此增加服务端最新快照同步和独立只读查看模式。

## 已确认的范围

- 只同步每位主播、每个维护对象的最新工作台快照，不保存 AI 候选生成历史。
- 已确认的聊天消息和发送状态仍保留完整服务端历史，不受快照覆盖影响。
- 主播停止输入约 2 秒后自动同步草稿；AI 生成成功后立即同步最新候选。
- 快照仅在主播登录且服务端同步可用时上传；本地记忆开关只控制浏览器本地历史，不阻止已授权的服务端快照同步。
- 运营只能查看自己所辖主播；最高管理查看全部主播；主播本人继续使用可写工作台。
- 管理端进入主播工作台后是独立只读模式，不可输入、生成、复制、标记已发送、清除记忆、修改画像或删除数据。
- 管理端查看不改变聊天状态、不覆盖主播快照、不产生主播操作记录；查看行为单独记录为审计动作。

## 非目标

- 不连接抖音私信，不自动发送，不代替主播发送。
- 不同步正在输入但尚未停顿的字符。
- 不保存每一轮 AI 候选历史、被替换的草稿历史或已清理快照的旧版本。
- 不把管理端的查看权限扩展为消息写入权限。

## 数据模型

新增 SQLite 表 `anchor_workspace_snapshots`：

```sql
CREATE TABLE IF NOT EXISTS anchor_workspace_snapshots (
  id TEXT PRIMARY KEY,
  anchor_user_id TEXT NOT NULL,
  brother_id TEXT NOT NULL,
  draft_json TEXT NOT NULL DEFAULT '{}',
  ai_replies_json TEXT NOT NULL DEFAULT '[]',
  profile_json TEXT NOT NULL DEFAULT '{}',
  decision_json TEXT NOT NULL DEFAULT '{}',
  opening_topics_json TEXT NOT NULL DEFAULT '[]',
  live_invite_json TEXT NOT NULL DEFAULT '{}',
  memory_enabled INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  UNIQUE (anchor_user_id, brother_id),
  FOREIGN KEY (anchor_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (brother_id) REFERENCES chat_brothers(id) ON DELETE CASCADE
);
```

快照字段均为经过服务端清洗和长度限制的 JSON。草稿结构至少包含 `text`、`status: "draft"`、`updatedAt`；候选保留最新一批，每条包含 `style`、`text`、`rationale`，统一附带 `status: "ai_candidate"`、`sent: false`。不接受客户端传入的密码、token、cookie、API key 或任意 HTML。

## 服务端接口

### 主播同步

新增 `PUT /api/chat/workspace-snapshot/`，仅允许 `anchor`。

请求体：

```json
{
  "brotherId": "server-brother-id",
  "snapshot": {
    "draft": { "text": "先休息一下，别太累了", "status": "draft" },
    "aiReplies": [{ "style": "温和", "text": "...", "rationale": "..." }],
    "profile": { "summary": "...", "interests": ["运动"] },
    "coreDecision": { "action": "先接住情绪" },
    "openingTopics": ["最近训练还顺利吗"],
    "liveInvite": null,
    "memoryEnabled": true
  }
}
```

服务端按 `(anchor_user_id, brother_id)` 原子 upsert，更新时间由服务端生成；主播只能写自己的维护对象。写入成功记录 `workspace.snapshot.update`，日志只包含主播 ID、维护对象 ID、版本和字段摘要，不写入完整草稿或 API 材料。

### 管理端查看

新增 `GET /api/ops/anchors/:anchorId/workspace/`，允许 `operator` 与 `super_admin`：

- 运营只能访问 `anchor.operator_id = currentUser.id` 的主播；最高管理可访问所有 active 主播。
- 支持可选 `brotherId`，不提供时返回该主播的维护对象列表和每个对象的最新更新时间。
- 返回该主播的维护对象、最新快照和完整服务端聊天消息；聊天读取沿用现有只读权限。
- 每次查看记录 `workspace.snapshot.view`，不修改 `updated_at`，不写入消息。
- 主播访问该管理接口返回 403；不存在或不属于权限范围的主播统一返回 404/403，不泄露其他组织是否存在该账号。

快照不存在时返回结构化空态：`snapshot: null`，并明确“主播尚未同步当前工作台”，不能回退到其他主播或浏览器本地数据。

## 前端交互

### 主播端

- 维护对象切换、草稿停顿 2 秒、AI 生成成功、画像开场更新时触发快照同步；使用防抖和请求序列号，旧请求不能覆盖新内容。
- 顶部显示“服务端工作台同步已开启/同步异常”；失败只提示，不阻塞主播继续工作，下一次状态变化可重试。
- 明确显示“当前草稿和 AI 候选对所属运营及最高管理可见”。
- 已发送消息继续通过现有消息接口写入历史，不把“复制”误标记为发送。

### 管理端

- `/admin` 的主播列表增加“进入查看”按钮；运营只看到自己的主播，最高管理看到全部主播。
- 进入 `/chat?viewAsAnchor=<anchorId>` 前先由服务端返回可访问主播，页面加载只读模式；不接受仅靠前端参数隐藏按钮作为权限依据。
- 只读工作台保留主播端的三栏结构：维护对象列表、微信式聊天记录、当前快照/画像/AI 候选；草稿和候选清晰标注“未发送”。
- 隐藏或禁用：新增维护对象、消息输入、截图导入、AI 生成、放入输入框、复制、标记已发送、清除本地记忆、退出登录以外的写操作。
- 提供“返回运营复盘”按钮；管理端不会拥有主播本人的本地浏览器记忆。

## 权限与安全

- 服务端每次快照写入和读取都从 HTTP-only 会话获得当前用户，不信任 `anchorId`、`operatorId` 或客户端角色字段。
- 快照响应递归清除敏感键，限制单个快照总大小和候选条数；超限返回 400，不截断成不可辨认的正文。
- 文本使用 React 普通节点渲染；不使用 `dangerouslySetInnerHTML`。
- 只读模式的所有 API 调用均为 GET；任何 POST/PUT/DELETE 从只读页面发起都应被服务端拒绝。
- 审计日志不包含完整草稿和候选正文，正文只在权限校验后的快照响应中返回。

## 测试与验收

1. 存储层：主播可 upsert 自己的最新快照；同一维护对象第二次写入覆盖旧草稿和候选；聊天历史不被覆盖。
2. 权限层：运营可读自己主播，不能读其他运营主播；最高管理可读全部；主播不能调用管理查看接口。
3. API：未登录 401、越权 403/404、非法快照 400、大小和条数限制、敏感字段清洗、服务端时间戳和审计动作。
4. 主播端：草稿 2 秒防抖同步、AI 生成立即同步、旧请求不覆盖新请求、服务端异常可恢复。
5. 管理端：进入查看、切换维护对象、查看最新草稿/候选/画像/决策/聊天正文、明确未发送状态、所有写控件不可用。
6. 回归：`npm test`、`npm run build`、`git diff --check`；真实 3102 完成主播同步→运营查看→最高管理查看链路。

## 验收标准

- 运营和最高管理可从后台直接进入授权范围内的主播只读工作台。
- 看到的草稿和 AI 候选是最新一批，并明确标记为未发送。
- 看到完整已同步聊天记录、画像分析和 `goutoujunshi` 决策信息。
- 管理端无法修改、生成、复制或标记主播内容，服务端越权和写入请求均被拒绝。
- 主播端原有手动输入、AI 生成、发送确认和本地记忆流程保持可用。
