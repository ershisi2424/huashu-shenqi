# Runtime 唯一入口设计

## 目标

将正式聊天的 AI 分析统一收敛到 `/api/profile` 的服务端 `goutoujunshi Runtime → GLM-5.3` 链路。旧首页只保留兼容入口和展示，不再在浏览器侧独立计算一套关系判断后把结果作为正式分析依据提交。

## 当前问题

`/chat` 已通过服务端恢复当前主播、大哥和已确认来源消息，再运行 Runtime。旧 `pages/index.js` 仍在浏览器端调用 `analyzeGoutoujunshi`，形成第二套关系判断路径。两条路径的规则、历史窗口和知识选择可能不同，导致页面显示的关系状态与实际生成上下文不一致，也增加了维护成本。

## 方案

1. 保留 `/api/profile` 作为唯一正式生成入口。
2. `pages/index.js` 不再把浏览器侧 `analyzeGoutoujunshi` 结果作为服务端分析输入；前端只提交当前消息、服务端可验证的来源 ID、历史展示数据、素材和回复偏好。
3. 服务端继续以会话和数据库为准重建正式账号的当前消息与历史，游客继续使用隔离的临时链路。
4. 旧首页的关系状态卡片改为渲染 `/api/profile` 返回的 `relationshipState`；生成前可以显示“等待服务端分析”，不能显示一套本地预判冒充正式 Runtime 结果。
5. 删除无效 import 和不再使用的旧分析提交字段；保留 `lib/goutoujunshi-core.js` 作为兼容测试/离线适配模块，暂不物理删除，避免破坏已有导入和历史数据。

## 数据边界

- 正式主播请求必须有 `sourceMessageId`，服务端从当前维护对象读取消息正文。
- 浏览器提交的 `relationshipState` 不再覆盖服务端 Runtime 结果。
- 任何客户端传入的旧分析、画像或候选都只能作为显示草稿，不能升级为事实。
- 不改变现有安全校验、人工选择、人工修改和手动发送流程。

## API 兼容

`/api/profile` 的响应字段保持兼容，继续返回 `relationshipState`、`runtime`、`replies`、`profile` 和 `algorithmCore`。旧首页只调整读取方式，不改变页面上的主要交互。

## 错误处理

- Runtime 输入不完整时沿用现有 `RUNTIME_SCOPE_REQUIRED` / `RUNTIME_SCOPE_INVALID` 映射。
- 服务端分析失败时，页面显示可重试状态，不回退到浏览器本地旧分析结果。
- 旧入口不因为服务端分析失败而把过期关系状态误标为当前状态。

## 验收标准

1. 新测试证明 `pages/index.js` 不再调用 `analyzeGoutoujunshi` 或提交 `relationshipState` 作为正式分析输入。
2. 旧首页仍能通过 `/api/profile` 生成并展示服务端 Runtime 结果。
3. 当前 `/chat` 行为不变，来源消息绑定、候选保存、历史恢复和角色权限测试继续通过。
4. 正式账号、游客和未登录行为保持现有权限边界。
5. `npm test`、独立生产构建和 `git diff --check` 通过。
