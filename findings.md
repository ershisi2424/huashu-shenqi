# 发现记录

## 2026-10-03：固定版聊天工作台排布确认

- 用户确认采用固定排布，不做拖拽布局编辑器；目标是让主播按“看关系资料 → 看聊天 → 选 AI 回复 → 修改并确认发送”的单向流程操作。
- 目标结构：顶部集中展示当前维护对象的画像摘要、维护任务、关系时间线和沟通边界；中部只展示微信式聊天记录；底部展示主播回复输入框、AI 候选、复制与已发送确认。
- 用户提供的参考图强调聊天正文需要占据主要视觉高度，右上保留“主播确认制”状态，不把 AI 候选卡片混进聊天气泡区域。
- 当前代码的 `ChatWorkspace` 是单个大组件，`layout` 下有维护对象列表、`chat` 中的聊天/录入区和 `aiPanel`；画像、任务、时间线仍都在 `aiPanel` 内，因此需要只调整 JSX 分区和 CSS，不重写服务端同步、权限或 AI API。
- 当前 AI 候选点击已经通过 `setAnchorDraft(reply.text || "")` 写入主播回复输入框；重排必须保留该行为、候选持久化和服务端快照。
- 当前 601–900px 断点已取消工作台固定高度以修复裁切，但本轮要进一步把关系信息从候选区抽离，移动端采用顶部折叠关系摘要、聊天区、回复区三段顺序。

## 2026-10-03：完整原仓库运行时级别复刻盘点

- 上游 `vendor/goutoujunshi` 不是 Node/Python Web 服务，而是一个面向 AI 宿主的 Skill：`SKILL.md` 定义行为内核，`references/` 按需提供知识与实用策略，`scripts/validate_skill.py` 做结构/预算/回归验证，`scripts/memory_store.py` 提供同意门禁、长期记忆、暂停/恢复/撤销/删除与限量。
- 上游运行流程明确为：情绪落地 → 建档 → 事实/推测/未知拆分 → 按场景检索 1–3 份资料 → 互惠/现实/风险/机会成本判断 → 建议与理由 → 行动/话术/观察窗口/停止条件；不读取抖音后台、不自动发送、不把 MBTI 或模型推断当事实。
- 当前 `lib/goutoujunshi-core.js` 是确定性适配层，能输出关系状态和决策，但尚未实现上游 `SKILL.md` 的完整运行时能力；`pages/api/profile.js` 只加载 allowlist 中最多 3 个参考文件并交给 GLM-5.3。
- “完整复刻”需要新增本地 Runtime 接口，将上游 Skill 的路由、档案问卷、素材来源边界、逐步分析、参考资料按需加载和记忆命令封装为可测试 Node 模块；现有 GLM-5.3 回复接口应改为消费 Runtime 输出，而不是自行替代 Runtime。
- 运行时边界：只处理主播主动提供且授权的文本/截图识别结果；不增加抖音登录、私信抓取或自动发送；长期记忆必须有明确同意、按主播/维护对象隔离、支持暂停/撤销/删除和上限控制。

## 当前实现事实

- `lib/auth-store.cjs` 已有 users、sessions、audit_logs、chat_brothers、chat_messages 表；用户状态为 pending/active/disabled。
- `audit_logs` 当前保存 actor_user_id、target_user_id、action、metadata、created_at；永久删除需要增加脱敏快照字段以避免外键失效。
- `ChatWorkspace` 目前将 `anchorDraft`、`replies`、`profile`、`coreDecision`、`algorithmCore`、`openingTopics`、`liveInvite` 保存在 React 状态，聊天消息通过 `/api/chat/*` 同步。
- `listChatBrothers` 和 `listChatMessages` 已允许 super_admin/所属 operator 只读访问，但没有当前工作台快照接口。
- `/admin` 当前混合审批、运营复盘、主播账号和审计区域，需要拆分为独立页面并保留导航。
- 用户管理危险操作必须同时由 API 权限和数据库事务保护，不能依靠前端隐藏按钮。

## 2026-10-05：AI 候选错配与消失根因调查

- 截图中当前目标是“多少钱可以睡你”，但候选内容仍是“吃饭了吗”上下文；这不是 GLM-5.3 自行编造历史，而是工作台快照只保存最新候选正文，没有保存候选对应的 `sourceMessageId`，刷新后无法判断候选属于哪一条大哥消息。
- `generateReplies()` 在请求发出后没有生成批次 token，也没有 AbortController；用户切换目标消息或录入新消息时，旧请求仍可在稍后返回并执行 `setReplies()`、`setProfile()` 和保存快照，导致旧候选覆盖新目标。
- `chooseReplyTarget()` 和 `confirmBrotherMessage()` 会清空候选，但不会使正在进行的 AI 请求失效，因此“候选先消失，随后又出现旧候选”可以稳定解释截图现象。
- `workspaceTouchedRef` 只防止旧工作台快照 hydration 覆盖当前编辑态，不能防止 AI 请求自身的异步回写；现有 `test-chat-workspace-state.cjs` 只覆盖 hydration，不覆盖生成批次竞态。
- 需要把候选批次绑定到 `brotherId + sourceMessageId + generationId`，保存和恢复时必须匹配当前目标；过期响应只能被丢弃，不能显示为当前回复。

## 2026-10-05：账号与服务端边界调查

- `chat_brothers` 已有 `owner_user_id`、`operator_id`，可以在不改表结构的情况下承载运营/最高管理的独立工作区；当前创建、写消息、快照和回复历史写入仍硬编码为主播角色。
- 当前 `listChatBrothers()` 对运营返回所辖主播、对最高管理返回全量对象；直接打开 `/chat/` 需要增加 `personal` 查询范围，不能复用管理复盘的全量/所辖查询，否则会再次串线。
- `pages/api/profile.js` 会为所有登录角色挂载 Runtime memory adapter，而长期记忆存储层只允许主播；运营/最高管理独立空间需要跳过主播长期记忆适配器，避免 AI 分析被错误的记忆权限异常阻断。
- 审批 API 和只读工作台已经存在，超级管理员可处理运营与主播审批；缺口主要是统计口径、工具运行状态聚合和运营对主播的建议点评持久化，而不是重写审批链路。
- 后台三页目前共用 `admin.module.css`，但审批中心使用 `approvalPage/approvalCard`，日志和用户管理仍引用缺失的 `.page/.card/.topline` 基础类，导致两页在深色全局背景下层级与对比度不一致。统一应复用审批中心已落地的浅色工具感 token 与页壳，不触碰服务端权限和危险操作流程。
- GLM-5.3 当前真实调用入口为 `pages/api/profile.js`，服务端已区分 Key 缺失、401、403、429/1113、超时和 Schema 错误；`/api/health` 只证明配置读取，不能替代真实请求。OCR 入口为 `pages/api/ocr.js`，真实实现依赖 `tesseract.js` 按需加载 `chi_sim+eng`，图片不落盘且 blocks 默认归为大哥侧，必须保留人工确认门禁。
- 下一阶段采用本机 smoke 脚本验证真实 HTTP/Key/语言包链路，使用合成聊天样本和本地测试 PNG；不新增网页诊断路由、不读取数据库或真实抖音素材。
- 联调实现位于 `lib/smoke/ai-ocr-smoke.cjs` 与 `scripts/ai-ocr-smoke.cjs`：固定执行 health → profile → ocr，限制目标为本机回环地址，返回脱敏阶段结果；合成 PNG 为 `fixtures/ocr-synthetic-chat.svg/.png`。
- 2026-09-30 实测 `npm run smoke:ai-ocr` 真实访问本机 3102 服务，返回 `ZAI_API_KEY_MISSING`；说明服务可达但当前服务进程没有读取智谱 Key，不能据此宣称 GLM-5.3 或 OCR 实机通过。离线 runner 契约覆盖成功结构、Key 缺失、鉴权、限流、欠费、OCR 依赖和图片错误。

## 2026-10-01 服务配置阶段

- 原 `/api/settings` 没有角色鉴权；新增 `/api/admin/settings` 与 `/api/admin/settings/test`，均要求 `super_admin`，并保留同源检查。
- `lib/ai-provider.cjs` 现在统一负责智谱配置、端点规范化、真实调用、超时和 401/403/429/欠费错误映射；`/api/profile` 和 `/api/health` 复用该边界。
- 普通聊天页不再提交 API Key，只显示脱敏状态；设置入口移动到 `/admin/settings/`。
- UI workflow 脚本因本机缺少 `/Users/a24/.agents/skills/ui-assets/assets/style-presets.json` 无法运行；已按已读取的 ui-core/ui-web/ui-feedback 规则继续，需用 UI 静态和运行时检查补证。
- 收尾时在受限 exec 环境再次运行 `npm run smoke:ai-ocr` 返回 `NETWORK_UNAVAILABLE`；同一服务仍可由浏览器访问 3102，判断为执行沙箱不允许 CLI 回环连接，不将其作为应用接口故障。此前真实回环 smoke 已确认服务可达但缺少 `ZAI_API_KEY`。

## 2026-10-01 服务配置回归修复

- `ServiceSettingsWorkspace` 明确提示 API Key 可留空保留已有配置，但 `saveProviderConfig` 原先先调用 `validateProviderSettings`，导致空值在 `writeLocalConfig` 有机会复用已有 Key 之前就抛出 `ZAI_API_KEY_REQUIRED`。
- 修复后，`saveProviderConfig` 的密钥解析顺序为：表单新 Key → 当前服务进程 Key → 指定 `.env.local` 中的已存 Key；最终仍由同一套校验写入配置，保存响应只返回脱敏摘要。
- 回归测试使用临时 `.env.local` 和虚构密钥，断言留空保存成功、服务端环境恢复密钥且响应不含密钥；未读取真实配置文件。
- 隔离生产构建使用 `cp -R node_modules`，避免跨目录软链接被 Next 16/Turbopack 判定为越过项目文件系统根目录。

## 2026-10-02 设置页会话过期反馈修复

- 浏览器现场的可访问性树显示：页面正文含“请先登录”，同时仍渲染“保存配置”和“测试调用”按钮；这与设置 API 的 `requireUser(..., ["super_admin"])` 权限边界一致，说明问题在前端状态门禁而非保存逻辑。
- 原因：`load()` 在 `/api/auth/me/` 非 2xx 时调用 `router.replace()` 后，`finally` 仍执行 `setLoading(false)`；`loading` 关闭后页面无条件渲染表单。设置 API 之后返回 401 时也没有独立的登录跳转分支。
- 修复：增加 `access` 状态；只有 `access === "granted"` 才渲染配置工作区；未登录或设置 API 会话过期时标记跳转，并提供“返回登录”链接作为导航失败兜底。
- 浏览器验证：修复后当前失效会话页面不再显示表单，显示“服务配置暂不可用”和“返回登录”；已导航到 `/login/?returnTo=%2Fadmin%2Fsettings%2F`，未代用户输入密码。

## 2026-10-02 GLM-5.3 测试调用参数修复

- 页面错误为“智谱测试调用失败”，而不是 Key 缺失、Key 无效、限流、欠费或网络不可达；这些错误在 `pages/api/admin/settings/test.js` 有单独映射。未映射的 `ZHIPU_REQUEST_FAILED` 会落到通用提示。
- `lib/ai-provider.cjs:testProviderConnection()` 原先发送 `thinking: { type: "disabled" }`。智谱官方 GLM-5.3 说明明确表示关闭思考不再支持，必须使用启用思考和 `low/high/max` 推理强度。
- 修复后的测试请求发送 `thinking: { type: "enabled" }`、`reasoning_effort: "low"`，内容只要求返回 `OK`，不额外发送 `response_format`。
- 追加 `ZHIPU_REQUEST_FAILED` 安全错误提示：“智谱拒绝了测试请求，请检查模型名或请求参数”，不透传上游原始响应，避免泄露请求或凭证信息。

## 2026-10-02 欠费误判排查

- 服务端脱敏检查确认当前工作树配置存在：模型为 `glm-5.3`、接口地址为 `https://open.bigmodel.cn/api/paas/v4`、Key 仅确认存在和长度，不读取内容；设置页刷新后状态为“已读取配置”，没有残留欠费提示。
- 原分类逻辑只要收到 `429 + code=1113` 就返回 `ZHIPU_ACCOUNT_ARREARS`，没有验证上游消息是否包含余额、欠费或额度证据，因此可能把模型/套餐/参数拒绝误报成欠费。
- 修复后仅在上游错误消息明确包含账务/余额/额度证据时归类为 `ZHIPU_ACCOUNT_ARREARS`；否则归类为 `ZHIPU_REQUEST_FAILED`，管理员测试接口仅返回脱敏的 `upstreamStatus/upstreamCode` 诊断字段。
- CLI 直连在受限 exec 沙箱中返回 `NETWORK_UNAVAILABLE`，不能作为智谱真实响应证据；浏览器页面可正常加载 3102。真实外部权限仍需用户在设置页点击一次测试调用确认。
# 2026-10-02 聊天工作台人性化增强

- 现有聊天数据在 `chat_brothers`、`chat_messages`、`workspace_snapshots`；服务端权限集中在 `lib/auth-store.cjs`，主播可写、运营/最高管理只读。
- 当前 AI 请求由 `ChatWorkspace` 调用 `/api/profile/`，已有 `replyPreferences`、`generationMode`、`coreDecision` 和 `algorithmCore`，可扩展为风格与发送前检查字段。
- 当前服务端只记录消息与工作台快照，尚无收藏、置顶、关系事件、运营备注或聊天搜索索引；新增数据应通过维护对象外键级联清理。
- 当前截图 OCR 入口关闭，不能把新功能建立在平台自动读取或抖音后台抓取上。

## 2026-10-02 聊天工作台增强落地

- `chat_messages` 增加 `is_favorite`、`is_pinned`；`relationship_events` 和 `operator_notes` 通过维护对象外键级联清理，避免删除对象后残留关系记录。
- `/api/chat/search`、`/api/chat/marks`、`/api/chat/timeline`、`/api/chat/notes` 已接入现有会话与角色边界：主播可写自己的对象，运营只读授权范围，最高管理可读全量；运营备注不返回主播。
- `reply-style.cjs` 将风格限定为表达层参数，仍由现有 goutoujunshi → GLM-5.3 链路生成；`reply-check.cjs` 是发送前本地确定性提醒，不代替主播选择，也不自动发送。
- 聊天页新增搜索结果定位、收藏/置顶、关系时间线、运营备注、下次跟进任务卡和手机端暗色布局；截图 OCR 入口仍按之前决策隐藏。
- 最新验证：全量 `npm test` 通过；隔离生产构建通过；回环浏览器 AX/截图复审显示新控件可访问。静态 UI 规则检查仍报告原有聊天 CSS 的 6 个 BLOCK/2 个 WARN 原始字面量，未把既有基线误报为本阶段新增问题。

## 2026-10-02 回复候选闪退与主播隔离修复

- 问题根因：工作台快照 GET 在主播生成候选前启动，响应返回时闭包仍看到空候选，可能用旧快照执行 `setReplies`，覆盖刚生成的候选；仅在生成函数里再次 `setReplies` 不能阻止这条旧请求回写。
- 修复：`lib/chat-workspace-state.cjs` 以请求令牌、主播交互标记和当前草稿/候选状态共同决定是否允许快照 hydration；切换维护对象会使旧请求失效，生成、编辑、选择候选和素材输入都会标记工作台已被操作。
- `reply_history` 按 `brother_id + owner_user_id` 保存每次 AI 生成批次，`/api/chat/reply-history` 只允许主播写入，运营/最高管理按既有维护对象权限读取；聊天页支持按批次恢复候选。
- 本地记忆从全局 `hh_chat_v1` 扩展为认证用户命名空间（例如 `hh_chat_v1:user_<id>`）；匿名预览继续兼容旧键。服务端维护对象原有 owner 权限保持不变。

## 2026-10-03 回复工作区输入框宽度回归

- 截图中的窄输入框可以稳定复现：`ChatWorkspace` 已从旧 `.composer` 容器迁移到 `.replyComposer`，但 textarea 的 `display:block`、`width:100%`、最小高度和暗色边界样式仍只定义在 `.composer textarea`，导致浏览器按原生 textarea 宽度（约 20 个字符）渲染。
- 修复仅补齐 `.replyComposer textarea` 的同等基础样式和暗色主题样式，没有改变候选选择、消息同步或发送确认逻辑。
- 新增响应式回归断言，确保主播回复工作区输入框继续占满可用宽度；修复前测试按预期失败，修复后通过。
- 3102 浏览器重新加载后复核：大哥消息和主播回复输入框均横向铺满左侧卡片，发送前检查、开场按钮和操作按钮不再被窄框挤压；AI 候选区保持独立显示。

## 2026-10-03 Runtime 错误提示作用域

- `pages/api/profile.js` 的 Runtime 最小输入调用已通过离线测试，当前 `goutoujunshi Runtime 输入不完整` 不是 Runtime 每次必然失败的证据；前端原先把任何一次错误无条件渲染在候选区，造成旧错误看起来“始终显示”。
- 修复后 AI/日常开场错误带上 `brotherId + latestMessageId` 作用域，切换对象或录入新消息时自动失效；对象级任务、OCR、长期记忆错误只绑定对象，不会串到其他大哥。
- 浏览器现场刷新 3102 后 AX 树显示候选已恢复，未出现红色 Runtime 错误；没有修改抖音发送边界或 AI Runtime 算法。

## 2026-10-03 Runtime 输入不完整真实根因

- 浏览器现场点击生成可稳定复现红色 `goutoujunshi Runtime 输入不完整`，所以不能只按前端残留提示处理。
- 追加服务端 Error.message 诊断后，真实错误为 `ACTIVE_USER_REQUIRED`。`pages/api/profile.js` 构造了 `{ userId, role }`，但 `lib/auth-store.cjs` 的 `actorRow` 只读取 `actor.id`；同时 `lib/goutoujunshi-runtime/input.js` 又把 `id` 丢弃，导致 Runtime 调用 auth-store 的对象级记忆状态时找不到主播。
- 同期确认了第二个作用域缺陷：`ensureServerBrother` 在 `/api/chat/brothers/` 同步失败时返回本地 `bro_*` ID，而 auth-store 只接受 `chat_brothers.id` 数据库 UUID。该回退会触发 `CHAT_BROTHER_NOT_FOUND`，因此已改为空值并让 API 使用昵称回退的无记忆路径。
- 修复后的身份对象保留 `id` 与 `userId` 两个兼容字段；离线 Runtime、API、聊天契约测试通过，浏览器 3102 生成链路实际成功。
- Runtime API 现在只把缺少作用域标识映射为“输入不完整”；会话失效返回 `AUTH_REQUIRED`，维护对象不存在/越权返回 `RUNTIME_SCOPE_INVALID`，便于主播按提示处理而不是误判 API 余额。

## 2026-10-04 超级管理员个人聊天串号根因

- `lib/auth-store.cjs` 的 `listChatBrothers` 对超级管理员按设计返回全部维护对象，供运营后台和主播只读预览使用；数据库中的 `003`、`001` 和测试对象分别属于不同主播，服务端权限本身没有把它们混在同一位主播名下。
- 问题出在主 `/chat/` 页面：`ChatWorkspace` 对所有已登录角色调用全量 `/api/chat/brothers/`，并恢复 `user:<账号 id>` 下的本地快照，所以超级管理员打开个人聊天页时会看到其他主播的维护对象。
- 修复边界：个人 `/chat/` 只允许 `anchor` 角色加载/保存聊天作用域；运营和超级管理员显示进入运营后台的入口，通过 `/chat/viewer/?anchorId=...` 查看指定主播的只读工作台。后台全量查询能力保留，不影响管理审计和只读预览。

## 2026-10-04 左侧消息未绑定专项 AI 回复根因

- `confirmBrotherMessage` 原本只把文本写入本地/服务端聊天记录并清空候选，不会触发 AI；生成按钮随后固定读取 `latestBrotherMessage`，页面没有任何消息选择状态。
- 因此点击或查看历史左侧气泡不会改变本轮 `currentMessage`，主播无法让 AI 针对指定的一条大哥消息回复；如果误以为录入按钮会自动分析，也会看到候选区没有更新。
- `/api/profile/` → goutoujunshi Runtime → GLM-5.3 的调用链已存在，缺口是前端目标消息绑定而非模型接口。新增 `pickReplyTarget`：默认最新已确认大哥消息，手动选择时优先使用被选消息，未确认消息不会进入分析。

## 2026-10-05 聊天候选区排版错位根因

- 运行时截图中候选卡片顶部被截去、第三行按钮落到水平分隔线下方，和 `.replyWorkspace{max-height:48%;overflow-y:auto}`、`.chat{overflow:hidden}`、桌面 `.layout{height:min(820px,calc(100dvh - 148px))}` 的组合一致：回复区内部滚动层在固定高度内裁切了自己的内容。
- 左侧“等待输入/复制回复”看起来被压窄并非数据串号，而是同一个固定高度网格中的回复编辑区和候选区同时争夺可用高度；移除桌面回复区高度约束后，两列以内容高度对齐。
- 修复范围只涉及 `components/chat/chat.module.css` 的桌面布局契约；`@media (max-width:900px)` 和手机端单列规则仍保留，未改变 AI 请求、候选保存、发送确认或主播数据隔离逻辑。

## 2026-10-05 核心聊天链路与商用角色能力修复

- `/api/profile` 在有登录对象时只接受服务端确认的 `sourceMessageId`；当前消息正文和历史配对由 `getChatGenerationContext` 从当前维护对象读取，浏览器提交的旧正文不能覆盖服务端上下文。
- 前端生成请求绑定 `brotherId + sourceMessageId + generation token`；切换对象、切换专项目标、录入新消息或清空候选都会使旧请求失效，旧响应不会再回写候选、画像、快照或回复历史。
- 工作台快照和回复历史保存 `sourceMessageId`，恢复时拒绝没有目标或目标不一致的旧候选；旧批次只会在独立的回复历史区回溯，不会冒充当前候选。
- 主播、运营、最高管理在 `/chat/` 使用各自的 `user:<id>` 个人空间；主播长期 Runtime 记忆适配器不会挂载到运营或最高管理请求。管理账号仍可从后台按权限进入指定主播的只读工作台。
- 只读主播工作台允许运营/最高管理对当前维护对象写入内部点评，点评通过 `operator_notes` 保存并按运营范围隔离；主播端不读取这些备注。
- 维护任务卡增加“采用这条建议参与本轮 AI 生成”选择；采用时仅将任务方向作为提示送入 GLM-5.3，仍以当前消息和服务端 Runtime 事实边界为准，不把任务建议当成事实或发送指令。
- 超级管理员审批、操作审计、用户管理和工具使用页均保留；工具使用只记录模型、状态、耗时和错误码，不记录 API Key 或请求正文。
- 最终验证：`npm test` 全量退出码 0；隔离临时目录 `npx next build` 通过；`git diff --check` 通过；3102 浏览器复核当前目标与候选/历史已分离。
# 2026-10-05 新请求：审批、只读入口、任务创建与游客会话（排查起点）

- 审批中心当前对 `super_admin` 并行加载 `/api/auth/approvals/`（运营申请）和 `/api/auth/anchor-approvals/`（主播申请）；对 `operator` 只加载主播申请，并把返回结果写入 `items`。如果最高管理员看不到运营待办，问题更可能在存储查询/测试数据库/会话角色，而不是 UI 队列分支；需要用同一 actor 会话验证接口 payload。运营身份本身没有查看运营注册申请的权限，不能通过前端绕过。
- `/api/auth/approvals/` 已强制 `super_admin`，GET 调用 `listPendingOperators()`；`/api/auth/anchor-approvals/` 允许 `operator` 和 `super_admin`，并调用 `listPendingAnchorsForApprover(approver.id)`。审批 API 目前没有游客或未登录分支。
- 主播只读页 `ReadonlyAnchorWorkspace` 只请求 `/api/chat/workspace-snapshots/?anchorId=...`，401 时跳转登录；页面本身没有第二套登录。若运营/最高管理进入后仍被要求登录，需要检查当前 `hh_session` 是否在同一 origin 有效、目标 `anchorId` 是否通过当前 actor 的后端范围校验、以及后台链接是否从当前会话跳转而非另开匿名页面。正确目标应是复用现有会话而不是开放匿名读取。
- 维护任务 API 目前仅支持 GET/PATCH；存储已有 `maintenance_tasks` 与自动创建/更新方法，但尚未发现人工 POST 创建契约。新增任务需要明确 owner/brother 范围，并由服务端根据 actor 角色校验：主播只能自己的对象，运营只能名下主播，最高管理员可全量（如产品确认）。
- 现有认证角色只有 `super_admin`、`operator`、`anchor`，sessions 只记录 `user_id` 和过期时间，没有 `last_seen_at`/guest 专用生命周期。手机号无密码游客若直接进入主播真实聊天会构成越权；安全方案必须是独立 guest 会话、只读且隔离（演示或显式分享范围），并以最后活动/退出后的 24 小时清理，不删除正式账号或主播数据。

## 代码证据补充

- `listPendingOperators()` 的 SQL 是 `role = 'operator' AND status = 'pending'`，API `/api/auth/approvals/` 仅接受 `super_admin`。当前 `ApprovalCenter` 对最高管理员会请求该接口并渲染 `items`；因此需要区分“接口查不到”与“页面使用旧会话/旧构建”两类问题，不能先改 UI 猜测。
- `listReadonlyWorkspace()` 对运营按 `anchor.operator_id === current.id` 限制，对最高管理员全量允许；只读页 401 才跳 `/login`，没有第二次登录逻辑。运营/最高管理进入主播页的正确实现是当前 `hh_session` 可复用、服务端按 `anchorId` 校验；未登录仍必须 401。
- `maintenance_tasks` 只有自动回复任务的 `ensureReplyTask()` 和通用 `updateMaintenanceTask()`；`/api/chat/tasks/` 的 Allow 头目前为 `GET, PATCH`，手工任务需要新增独立创建方法以避免伪造 `source_message_id`。
- 用户表 `password_hash NOT NULL` 且 role CHECK 不含 guest；session 没有活动时间列。游客功能不能直接复用正式用户登录接口，需新增独立 guest 身份/会话表或安全迁移，并设计清理触发点（登出、每次 guest 请求、定时/启动清理）。

## 运行时缓存证据

- `public/sw.js` 当前对所有同源 GET（包括 `/api/auth/me/`、审批、聊天、快照和任务接口）使用 cache-first，缓存键不区分 `hh_session` Cookie。旧的空审批响应、其他账号的 me/聊天快照会被先返回，能够解释“审批待办消失”“登录后看见别人的聊天”“历史/旧候选回流”等跨页面症状；network 后台刷新不会阻止首屏错误状态。修复应把 `/api/` 请求完全排除运行时缓存，并通过版本升级/activate 清理旧 runtime cache；客户端认证数据也应使用 `cache: 'no-store'`。
- 当前工作树 `data/auth.sqlite` 确实有 2 条待审批运营申请，`listPendingOperators()` 能查出；因此审批 SQL 不是空数据根因。`ApprovalCenter` 的 `Promise.all` 还会在主播审批请求失败时阻止已成功的运营列表写入，需拆分请求或使用 `Promise.allSettled`，让运营队列独立显示并单独报错。
- 用户已确认游客可以使用完整 AI 候选，但只操作自己的临时数据；游客不应访问正式账号数据。游客会话需要独立 scope、只读外部发送边界、24 小时无人使用清理。

## 2026-10-05 游客工作台与审批/任务阶段结论

- 正式账号与游客保持两套 Cookie：`hh_session` 只代表正式角色，`hh_guest_session` 只代表匿名临时身份；游客登录时会撤销同请求携带的正式会话，避免正式身份优先导致工作区混用。
- 游客手机号只用于 HMAC 相关性校验，响应不返回明文手机号、HMAC 或 token；游客 AI 请求以匿名 guest ID 作为 Runtime 命名空间，且不写正式 AI 使用统计、审计、聊天对象、消息、任务、时间线或运营备注。
- 游客聊天数据采用 `guest:<id>` 本地命名空间，候选和回复历史只在本机保存；显式退出清除当前 guest 的 session snapshot、候选草稿、回复历史、长期记忆开关和 active 对象。
- 游客 `/api/profile` 每次请求做过期清理、touch 和 Cookie 滑动续期，并拒绝 `brotherId`、`sourceMessageId`、维护任务字段；正式登录用户仍由服务端消息上下文约束当前 AI 目标。
- 认证页与聊天页的健康检查已拆分，健康接口瞬时失败不会清掉已确认的正式/游客身份；Cookie 解码对畸形值安全失败，不会抛出 500。
- 非阻塞限制：浏览器 localStorage 中未显式退出的旧 guest 命名空间物理 key 仍可能保留，但新 guest ID 不可访问；真实生产可再增加按过期元数据的本地空间回收。

## 2026-10-05 Runtime 安全边界误报根因

- 用户看到“AI 回复越过 Runtime 安全边界，请重试”时，校验器并不区分“主播将发送的正文”和“模型对候选的内部说明”，而是对完整 JSON 做关键词匹配。
- 因此 rationale 或停止条件只要写出“不要诱导礼物”“不根据健康状况推断”等安全说明，就会触发 `INVALID_AI_POLICY`，即使候选正文是安全的。
- 修复后只扫描 `replies[].text` 和 `liveInvite.text`；真实诱导消费、虚假依赖和敏感属性推断仍会返回 `INVALID_AI_POLICY`。新增回归测试覆盖安全说明关键词不会误阻断。

## 2026-10-05 提示词文案调整边界

- 用户要求移除“诱导礼物”“不推断健康状况”等具体字样。已从 GLM 系统提示中移除清单式表述，改用隐私、自主决定和不利用压力的自然文案。
- 该调整不等于放开安全控制：`validateGenerationAgainstRuntime` 仍在服务端检查可发送正文，真实违规候选继续被拒绝；只有内部提示词的表达方式发生变化。

## 2026-10-05 生产化基线审查

- 测试入口原先由长命令串维护，遗漏了两份已存在的角色工作区测试；现在统一 runner 通过 `process.execPath` 启动每个测试子进程，并隔离数据库路径、会话、API Key 和 `NODE_OPTIONS`。
- 基线自测覆盖自动发现、排序、失败/超时、空测试集、敏感环境过滤、成功全跑和失败停跑；本轮 `npm test` 实际结果为 86/86 通过。
- Node 运行时已收口到 `>=22.0.0`，CI 从 Node 20 调整到 Node 22，和 `better-sqlite3` 的引擎要求一致。
- 生产阻断风险已登记，下一阶段必须先处理：维护对象/消息来源校验、对象切换后的异步旧结果丢弃、回复历史恢复持久化、认证默认强制与限流、数据库迁移版本和备份恢复。
- 当前没有浏览器挂载端到端测试，现有大部分测试为 API/模块契约；不能把全量通过解释为真实浏览器、供应商或 Windows 运行时已验收。

## 2026-10-05 回复来源边界与目标竞态修复

- 服务端之前只保存浏览器提交的 `sourceMessageId/currentMessage`，没有确认来源消息属于当前维护对象，也没有拒绝草稿/跨对象/不存在的来源；这会让历史记录和 AI 上下文出现错配。
- 现在所有生成上下文、回复历史和候选快照都经过同一个已确认来源校验，保存时用数据库消息正文覆盖客户端正文，并以 409 返回可处理的来源错误。
- 前端切换维护对象会失效当前生成批次并清理上一对象的画像、决策和候选；异步历史保存回写前检查对象/消息/批次，旧响应直接丢弃。
- 新增的来源边界和目标竞态测试先红后绿；全量测试从基线 84 项增加到 86 项，当前 86/86 通过。
- 独立生产构建第一次因临时副本的 `node_modules` 符号链接被 Turbopack 拒绝，改为复制依赖并补齐非敏感的 `data/scripts.json` 后构建通过；这不是业务编译错误。实时 3102 服务未停止。

## 2026-10-05 管理员初始化边界

- 旧 `ensureBootstrapAdmin` 只按手机号判断，任何新手机号都能继续创建活动最高管理员，初始化脚本也把普通账号手机号直接当成“已就绪”。
- 修复后初始化是幂等且单实例：同一活动最高管理员可重复执行；已有活动最高管理员拒绝新增；手机号已被其他角色使用时拒绝提升。密码哈希和账号数据仍不写日志。
- 管理员安全测试加入统一 runner 后，全量结果为 87/87；仍需实现受保护的重置/恢复流程。

## 2026-10-05 认证入口限流与浏览器回归边界

- 登录、注册和游客登录此前没有可验证的请求窗口边界；现在由 `rate_limit_buckets` 以 `(scope, bucket_key)` 唯一键和事务计数实现单实例限流，桶只保存 SHA-256 摘要，不保存手机号或 IP 明文。
- 来源解析默认使用 socket 对端地址；只有显式开启 `TRUST_PROXY=true` 才读取受信反向代理提供的地址，轮换伪造 `X-Forwarded-For` 不能绕过默认限流。
- 真实浏览器流程已形成独立数据库/临时端口/合成账号契约；受控执行环境禁止新建 `127.0.0.1:3210` listener（`listen EPERM`），所以当前只能报告契约和 Node/API 回归，不能宣称真实浏览器通过。
- 当前全量 `npm test` 为 93/93；限流实现仍是单 SQLite 实例，多实例部署前必须迁移共享存储并做并发压测；生产默认认证和账号枚举防护仍需专项验收。

## 2026-10-05 认证默认策略边界

- 旧实现只有在 `AUTH_REQUIRED=true` 时才要求登录，生产环境漏配变量会回落到匿名模式；这与局域网商用部署的安全预期不一致。
- 现在显式 `AUTH_REQUIRED=true/false` 仍优先；没有显式配置时，`NODE_ENV=production` 默认要求登录，开发环境保持预览兼容性。
- 健康检查、AI 入口和相关受保护入口共用 `authRequired()`，避免页面报告已开启认证而业务 API 按另一套条件放行。
- 该阶段记录的是恢复尚未实现时的边界；后续已补齐管理员签发的一次性令牌和恢复审计，但不能把它视作 Windows 实机灾备恢复方案。

## 2026-10-05 数据库迁移与备份生产边界

- 原有 schema 依赖 `CREATE TABLE IF NOT EXISTS` 与条件 `ALTER TABLE`，没有可审计的版本记录；这会让后续字段变更无法判断是否已应用，也无法发现同一版本定义被静默替换。
- 新增 `schema_migrations` 账本和 `0001.auth-store-baseline`：账本在当前 schema/兼容列初始化完成后写入；重复打开只复用同一 checksum，已应用 id 的 checksum 不一致会抛出 `MIGRATION_CHECKSUM_MISMATCH`，不会继续启动。
- 新增备份服务使用 better-sqlite3 在线 backup API，而不是简单复制主文件，避免 WAL 状态下副本不一致；完成后执行完整性检查并要求存在迁移账本，默认不覆盖既有目标。
- 自动化证据：`node test-db-migrations-backup.cjs` 通过了 baseline、重开幂等、checksum 冲突拒绝、源库哈希不变、备份 integrity_check 和覆盖保护；本阶段没有打开或修改正式 `data/auth.sqlite`，也没有重启 3102。
- 未完成：Windows 10 计划任务/服务托管、备份加密与异地传输、恢复到隔离实例、升级失败回滚、备份保留清理和多实例迁移锁；当前实现是单实例本地 SQLite 的安全边界，不是完整灾备方案。

## 2026-10-05 管理员密码恢复边界

- 账号恢复不开放手机号或账号枚举式匿名申请；只有已认证的活动超级管理员可为运营/主播签发恢复令牌，目标不存在、目标为最高权限或目标为当前管理员时分别拒绝。
- `password_reset_tokens` 使用一次性 SHA-256 token hash、短时过期和消费时间；签发新 token 会删除同一目标的旧 token。消费时用条件更新做单次 claim，避免并发请求重复使用。
- 密码更新、令牌消费、目标会话撤销和 `auth.password.reset` 审计在一个 SQLite 事务内完成；审计值经过现有敏感字段过滤，不写密码或原始 token。
- 定向测试已验证旧会话立即失效、旧密码不可用、新密码可登录、重复消费被拒绝、普通运营不能签发以及 API 响应不泄露敏感字段。
- 尚未完成：Windows 10 实机恢复通知和管理员失联流程、多实例共享 token/限流存储、恢复操作的运维审批与密钥轮换；当前实现是单实例本地 SQLite 的受保护边界。

## 2026-10-05 Windows 局域网部署前置边界

- 部署前置校验必须和 Next 启动解耦，才能在没有监听端口的情况下发现错误；`lib/windows-deploy-config.cjs` 接受注入配置，Windows 路径用 `path.win32` 规则判断，避免在 macOS CI 上误判 `C:\Huashu\data\auth.sqlite`。
- 生产配置要求 `NODE_ENV=production`、`AUTH_REQUIRED=true`、Node 主版本至少 22、绝对且位于应用目录之外的 `AUTH_DB_PATH`、有效端口和受支持监听地址；缺少 `ZAI_API_KEY` 只返回 `ZAI_API_KEY_MISSING`，不会回显值。
- `AUTH_COOKIE_SECURE` 与 HTTPS 终止关系被显式校验：HTTPS 声明但未启用 Secure 为错误；局域网明文试用仅给出提示，不被伪装成 HTTPS 已验收。
- PowerShell 启动脚本通过显式参数设置应用/数据目录和绑定端口，前台运行 `npm run start`；停止脚本默认不停止进程，`-Force` 前检查 Win32_Process 命令行是否包含指定应用目录，避免把同端口的其他服务当成项目进程。
- 证据边界：源码契约、合成配置和离线测试已验证；当前没有 Windows 10 实机、任务计划程序/NSSM/WinSW、真实防火墙、HTTPS、断电恢复或升级回滚证据。
- 启动前检查支持应用目录的受保护 `.env.local`：只读取 `configured` 布尔值，不把 API Key 注入输出或验证结果；这与管理员设置页保存后“重启加载配置”的行为一致。
