# 进度记录

## 2026-09-30

- 已确认新后台结构：审批中心、操作日志、用户管理。
- 已确认永久删除采用二次点击确认；停用/恢复可逆；审计保留脱敏快照。
- 已确认主播工作台只同步最新草稿和最新 AI 候选，不保留候选历史。
- 已建立 `task_plan.md`、`findings.md`，并按阶段完成后台与工作台改造。
- 阶段 1 已完成：`auth-store` 增加用户使用统计、停用/恢复、短时二次确认删除、删除依赖保护和脱敏审计快照；`test-user-management-store.cjs` 已通过。
- 已验证既有 `test-auth-store.cjs`、`test-audit-store.cjs`、`test-audit-api.cjs` 继续通过。
- 阶段 2-3 已完成：操作日志按操作人分组与详情 API；`/admin` 收敛为审批中心；新增 `/admin/audit`、`/admin/users` 和超级管理员用户管理接口。
- 阶段 4-5 已完成：新增 `workspace_snapshots` 最新快照表和主播写入/管理只读 API；主播端草稿约 2 秒保存、AI 候选生成后立即保存；新增 `/chat/viewer` 只读预览，服务端禁止运营/最高管理写聊天。
- 回归结果：`npm test` 全部通过；临时目录 `npm run build` 通过；临时数据库回环 `3102` 服务页面 `/admin`、`/admin/audit`、`/admin/users`、`/chat/viewer` 均 HTTP 200，未登录 `/api/admin/users/` 返回 401，验证管理员登录后返回 200。
- 最终 UI 检查：`check_ui_rules.py components/admin/admin.module.css` 通过；四个页面 `inspect_runtime.py` 均通过；旧聊天 CSS 的静态启发式检查仍会误报既有原始颜色规则，未将其混入本次后台改造结论。
- 续开发：用户管理中的主播行新增“进入工作台”直达入口，运营审批页新增“我的主播”列表和“进入主播工作台”直达入口，审批/创建主播后会刷新列表，链接带主播 ID 并沿用只读预览权限；焦点环颜色收进样式 token。定向契约测试、全量 `npm test`、临时目录 `npm run build`、`git diff --check` 和 UI 静态规则检查均通过。
- 当前本地服务已绑定 `127.0.0.1:3102`；`/admin/`、`/admin/audit/`、`/admin/users/`、`/chat/viewer/` 回环请求均为 200（未登录 `/api/auth/me/` 为 401），四个页面运行时 UI 检查通过。
- 审批中心 UI 优化：改为浅色纸面工具感布局，首屏突出待处理申请和数量；审批项加入编号、头像、申请时间、批准/拒绝按键状态；增加成功、错误、加载、空状态；运营端新增账号表单和主播工作台区块均按任务层级重排，移动端改为单列触控布局。UI 契约、全量测试、临时生产构建、静态规则和运行时检查均通过。
- 后台三页统一 UI：审批中心、操作日志、用户管理共享浅色工具感页壳、导航、身份信息、角色胶囊、摘要卡、提示/加载/空状态和移动端重排；日志 actor 列表补充稳定回退 key，避免无身份审计记录产生 React 列表警告。保留原有 API、权限、审批、停用、删除确认和只读工作台入口。
- 本轮验证证据：`node test-admin-ui.cjs`、全量 `npm test`、`check_ui_rules.py`、三个后台页面 `inspect_runtime.py --visual-reviewed` 均通过；隔离临时目录 `npm run build` 成功。三个页面已通过本地浏览器截图复审，当前本地预览仍运行于 `http://127.0.0.1:3102`。
- GLM-5.3/OCR 合成样本联调已实现：新增 `lib/smoke/ai-ocr-smoke.cjs`、`scripts/ai-ocr-smoke.cjs`、`fixtures/ocr-synthetic-chat.svg/.png` 和 `npm run smoke:ai-ocr`；联调只允许本机回环地址，使用虚构素材，输出不包含 Key、Cookie、原始请求或响应。
- 联调验证：定向 `node test-ai-ocr-smoke.cjs` 通过；本机 `npm run smoke:ai-ocr` 返回 `ZAI_API_KEY_MISSING`（服务可达但未配置 Key），因此真实 GLM-5.3/OCR 未作通过声明；隔离临时目录 `npm run build` 与本轮最终全量 `npm test` 均通过。

## 2026-10-01

- 已写入服务配置设计与实施计划；新增统一 `lib/ai-provider.cjs`，画像 API 和健康检查复用同一配置与智谱请求边界。
- 新增超级管理员专属 `/admin/settings/`、`/api/admin/settings/`、`/api/admin/settings/test/`；旧 `/api/settings` 改为受保护兼容入口。
- 普通聊天页 API 配置表单已移除，保留只读状态和后台入口提示。
- 定向 Provider、管理员 API、管理员 UI、设置兼容 API、健康检查和画像契约测试已通过；UI workflow 脚本因本机资源路径缺失未执行，待静态/运行时检查补证。
- 最终验证：全量 `npm test` 通过；隔离临时目录 `npm run build` 通过并包含 `/admin/settings`、`/api/admin/settings`、`/api/admin/settings/test`；`git diff --check` 通过。
- UI 静态检查：`components/admin/admin.module.css` 和 `ServiceSettingsWorkspace.js` 通过；旧 `styles/globals.css` 的历史原始色值启发式告警未作为本次设置页问题。浏览器回环复审确认服务配置页和聊天页只读服务状态可渲染；未登录时设置 API 返回 401，符合权限边界。
- 受限 exec 环境的收尾 smoke 返回 `NETWORK_UNAVAILABLE`，而浏览器可正常加载 3102；已区分为执行环境网络限制，不宣称真实 Key/OCR 调用通过。

## 2026-10-02（聊天画像素材输入）

- 按 TDD 为聊天素材字段、嵌套 `sources` 请求和本地/服务端快照恢复补充契约；先确认旧代码在新断言下失败，再完成实现。
- `ChatWorkspace` 增加默认折叠的“画像素材”区，支持作品文案、近期评论、公开发言三类纯文本；生成回复和日常开场都携带同一素材对象。
- `lib/chat-local-store.cjs` 与主播工作台快照增加脱敏限长的 `profileSources`，切换维护对象时清空当前编辑态，恢复快照时重新载入。
- `/api/profile` 兼容嵌套 `sources` 与旧版顶层字段，仍由服务端运行 goutoujunshi 核心算法并交给 GLM-5.3 生成回复。
- 浏览器刷新后确认聊天页折叠入口可见，展开后三个输入框可编辑；`npm test` 全量通过，隔离目录 `npm run build` 通过。

## 2026-10-01（续）

- 按 TDD 为“留空保留已有 API Key”补充临时文件回归用例；修复前稳定失败于 `ZAI_API_KEY_REQUIRED`，确认根因是保存前校验没有解析已有 Key。
- `lib/local-config.cjs` 增加服务端专用 `readStoredApiKey`；`lib/ai-provider.cjs` 在保存前解析表单、进程和文件中的 Key，并保持响应脱敏。
- `node test-ai-provider.cjs`、`node test-local-config.cjs` 通过。
- `npm test` 全量通过。
- 隔离目录生产构建通过，包含 `/admin/settings`、`/api/admin/settings` 与 `/api/admin/settings/test`；首次软链接依赖构建被 Turbopack 文件系统边界拒绝，改复制依赖后通过。

## 2026-10-02

- 浏览器复现设置页无反应：当前会话已失效，页面出现“请先登录”但仍保留可操作表单；API 请求实际会被服务端权限拦截。
- 按 TDD 先让 `test-admin-settings-ui.cjs` 在缺少权限状态契约时失败，再增加 `access` 门禁、401 登录跳转和“返回登录”兜底入口。
- 修复后浏览器失效会话不再显示配置表单；已确认登录页可打开，未自动填写或提交账号密码。
- `npm test` 全量通过；隔离复制依赖后的 `npm run build` 通过；`git diff --check` 通过。

## 2026-10-02（GLM-5.3 测试调用）

- 按 TDD 为测试调用请求体和 `ZHIPU_REQUEST_FAILED` 显示补充回归用例；修复前分别稳定失败于 `thinking.type = disabled` 和通用 200/错误提示断言。
- `testProviderConnection()` 改为 GLM-5.3 兼容参数：启用思考、低推理强度、最小纯文本请求。
- 管理员测试 API 对参数不兼容错误返回明确的安全提示。
- `node test-ai-provider.cjs`、`node test-admin-settings-api.cjs`、`npm test` 全量通过。
- 隔离复制依赖后的生产构建通过，`git diff --check` 通过。

## 2026-10-02（欠费误判分类修复）

- 按 TDD 增加 `1113` 带明确余额信息与不带账务证据两种回归场景；修复前后分别验证误判与真实欠费分类。
- `lib/ai-provider.cjs` 改为检查上游错误消息中的余额/欠费/额度证据后再返回 `ZHIPU_ACCOUNT_ARREARS`；未确认账务原因时不再向用户显示欠费。
- 管理员测试 API 对未确认账务的拒绝返回安全说明，并携带脱敏的上游 HTTP 状态与错误码，绝不返回 API Key 或完整上游响应。
- `node test-ai-provider.cjs`、`node test-admin-settings-api.cjs`、`npm test` 全量通过；隔离复制依赖后的 `npm run build` 通过。直接构建当前 `.next` 因 3102 开发服务占用返回 `EPERM`，未停止正在使用的服务。

## 2026-10-02（截图左右气泡识别与聊天复现）

- 按 TDD 先为 bbox 横向归属、从上到下排序、居中待确认和批量顺序写入补充契约；旧实现稳定失败后再完成实现。
- `lib/ocr/adapter.cjs` 支持截图宽度中线判断；缺少尺寸时使用气泡最大横向间距的保守左右分割；缺少可靠证据返回 `unknown`，不再默认误归为大哥。
- `ChatWorkspace` 读取截图自然宽度传给 OCR，预览中明确显示“左侧大哥/右侧主播”，保留人工改判，并新增“按截图顺序写入聊天”批量动作。
- 批量写入使用递增时间戳保留截图上下顺序，逐条同步服务端；主播右侧识别消息仍是 `confirmed`，不会伪造“已在抖音发送”。
- `lib/ocr/tesseract-adapter.cjs` 读取引擎返回的图像尺寸；OCR smoke 接受 `brother/anchor/unknown` 三种待确认方向。
- 定向 OCR/UI/smoke 测试、全量 `npm test`、隔离复制依赖后的 `npm run build`（`BUILD_EXIT=0`）和 `git diff --check` 均通过；当前 3102 开发服务保持运行，未上传真实截图。

## 2026-10-02（暂时隐藏截图识别入口）

- 根据后续升级安排，`ChatWorkspace` 增加 `ENABLE_SCREENSHOT_OCR = false` 开关，暂时不渲染截图上传、预览和批量写入区域。
- OCR 适配器、API、左右气泡算法和测试文件全部保留，没有删除后续升级所需实现；重新开放时只需打开该开关并重新验证。
- `handleOcrFile` 同步增加关闭保护，避免通过残留事件触发识别。
- `node test-chat-ui.cjs`、OCR 定向测试、隔离复制依赖后的生产构建和 `git diff --check` 通过；未上传真实截图。

## 2026-10-02（修正误粘贴聊天内容）

- `lib/chat-thread.cjs` 增加 `editMessageText`，修改前校验消息存在和内容非空；已发送消息允许修正但保留 `sent` 状态与原发送时间。
- `auth-store` 与 `/api/chat/messages/` 增加主播专用 PATCH 修改链路，运营/超级管理员仍只读；修改写入 `chat.message.edit` 审计事件。
- `ChatWorkspace` 增加消息气泡“修改 / 保存修改 / 取消”交互，修改后同步服务端；主播对已发送消息也能修改，并显示“已修改”标记。
- 审计页面补充“修改聊天消息”中文标签，避免显示原始动作名。
- 定向领域/API/UI 测试、`npm test`、隔离复制依赖后的生产构建（`BUILD_EXIT=0`）和 `git diff --check` 均通过。

## 2026-10-02（聊天滚动与全站暗色主题）

- 按 TDD 增加 `lib/chat-scroll.cjs` 和 `lib/theme.cjs`，覆盖消息列表贴底判定、浅色/暗色/跟随系统偏好解析；定向测试先失败后实现通过。
- `ChatWorkspace` 的消息区改为固定视口、内部滚动和 `overscroll-behavior: contain`，用户上滑时不强制跳回，新增“回到底部”按钮；切换维护对象和新增消息时按当前滚动位置决定是否贴底。
- 新增全局 `ThemeToggle`，统一写入 `hh_theme`，覆盖登录、聊天、审批、日志、用户管理、服务配置和旧首页；后台与聊天模块增加暗色变量和移动端 `100dvh` 布局约束。
- Service Worker 版本更新为 `v1.0.1-scroll-theme`，确保浏览器不会继续命中旧主题和旧布局资源。
- 浏览器已复审 3102 聊天长记录的内部滚动、登录页暗色、审批中心暗色；`npm test` 全量通过，隔离复制依赖后的 `npm run build` 通过，`git diff --check` 通过。

## 2026-10-02（维护任务中心）

- 按 TDD 新增 `lib/maintenance-task.cjs`，固化待回复、待跟进、稍后处理、已完成、已忽略状态和不可逆完成规则。
- `auth-store` 新增 `maintenance_tasks` 表：确认的大哥消息自动产生待回复任务，主播记录实际发送后自动完成；运营和最高管理按绑定范围只读查看，主播只能更新自己的任务并写入审计。
- 新增 `/api/chat/tasks/`、`/tasks/` 和 `MaintenanceTaskWorkspace`，聊天工作台同步显示当前对象任务卡，支持手机端筛选、状态反馈和暗色主题。
- 任务中心明确显示不会自动发送抖音消息、不读取平台后台；没有新增抖音登录或抓取能力。
- `test-maintenance-task.cjs`、`test-maintenance-task-store.cjs`、`test-maintenance-task-api.cjs`、`test-maintenance-task-ui.cjs` 已通过；全量 `npm test`、隔离复制依赖后的 `npm run build`、`git diff --check` 均通过。

## 2026-10-02（超级管理员全量审批）

- 按 TDD 增加最高管理员查看/审批全部主播申请的存储、API 和 UI 契约，先确认旧权限在新断言下失败。
- `listPendingAnchorsForApprover` 支持超级管理员全量查询；`approveAnchor/rejectAnchor` 根据服务端真实角色放行最高管理员，同时保留主播原运营绑定关系。
- `/api/auth/anchor-approvals/` 允许运营和超级管理员访问；运营范围不变，跨运营审批仍返回 403。
- 审批中心拆分“待审批运营”和“待审批主播”队列，超级管理员可直接处理两类申请。
- `test-super-admin-approval.cjs`、`test-super-admin-approval-api.cjs`、`test-super-admin-approval-ui.cjs`、相关既有审批测试均通过。
# 2026-10-03：完整原仓库运行时级别复刻

- 已完成只读盘点：确认上游项目类型、入口文件、运行流程、记忆脚本和当前适配层边界。
- 当前阶段停在设计门禁：尚未修改生产代码，等待用户确认复刻范围和兼容策略后进入规格与 TDD 实现。
- 用户已确认 A 方案、知识/记忆复刻设计、API/测试设计；安全边界已明确保留为非诱导消费和不推断敏感属性。
- 设计文档已写入并提交：`9660e02 docs: design goutoujunshi runtime clone`。
- 用户已确认设计；实现计划已写入 `docs/superpowers/plans/2026-10-03-goutoujunshi-runtime.md`，尚未修改生产代码。
- Task 1 已完成：新增 Runtime 输入清洗、主播/对象范围校验、来源/说话人映射和事实/推测/未知拆分；`node test-goutoujunshi-runtime.cjs` 通过。Node 对 ESM `.js` 有 MODULE_TYPELESS_PACKAGE_JSON 警告，暂不改变项目模块配置，Next 构建会按现有 ESM 方式处理。
- Task 2 已完成：新增上游参考路由、allowlist、路径越界保护、原文摘录和 SHA-256 provenance；普通问候加载 2 份，情绪场景最多加载 3 份；Runtime 定向测试通过。
- Task 3 已完成：新增首次建档/紧急例外、情绪与风险判断、唯一主目标、互惠/机会成本、观察窗口/停止条件和 GLM 输出安全校验；Runtime 定向测试通过。
- Task 4 已完成：SQLite 增加按主播/维护对象隔离的 Runtime memory 表和同意/暂停/恢复/撤销/忘记/清空/回滚方法；来源和条数上限受服务端校验；`node test-goutoujunshi-runtime-memory.cjs` 通过。
- Task 5 已完成：新增 Runtime 编排器和长期记忆 API；跨主播访问被拒绝，运营/管理只读；Runtime 定向、记忆 API、auth-store 回归通过。长期记忆默认不进入 GLM prompt，避免未经针对性同意将关系资料发送给外部模型。
- Task 6 已完成：`pages/api/profile.js` 先调用服务端 Runtime，再把固定版本、事实/未知、风险、主目标、动作和经校验的上游摘录交给 GLM-5.3；请求携带主播和维护对象唯一 ID，客户端目标不能覆盖服务端判断。服务端输出增加 `runtime`、`intake`、`analysis`、`memory`，并拒绝越过 Runtime 边界的生成结果。
- Task 7 已完成：聊天页和管理只读预览保存并展示本轮判断依据、资料不足提示、停止条件、上游 revision；对象级长期记忆状态支持主播明确同意、暂停、恢复和撤销清除，运营/管理保持只读。分析结果随主播/维护对象工作台快照保存，移动端沿用折叠面板和暗色主题。
- Task 8 已完成：`npm test` 全量通过，`npm run test:runtime` 通过，`python3 vendor/goutoujunshi/scripts/validate_skill.py` 通过，复制依赖到 `/private/tmp/huashu-build` 后 `npm run build` 通过；当前工作树 `.next` 因 3102 服务占用返回 EPERM，未触碰运行中服务或真实数据库。尝试在沙箱启动 3103 被系统 listen 权限拒绝，未将其误判为应用故障。

## 2026-10-03 固定版聊天工作台排布

- 按用户确认的 1 号方案，将聊天工作台固定为“顶部关系资料 → 中部聊天记录 → 底部主播回复”的单向操作流；没有引入拖拽布局编辑器，也没有改变服务端权限、AI API 或抖音发送边界。
- 顶部 `relationshipDock` 集中展示当前维护对象的画像素材、Runtime 判断依据、维护任务、关系时间线、沟通边界和运营备注；默认折叠详细资料，手机端纵向展开。
- 中部 `timeline` 只保留左右聊天气泡、修改/删除和滚动行为；底部 `replyWorkspace` 分开承载大哥消息输入、主播回复草稿、发送前检查、日常开场、复制/确认发送，以及 `aiCandidateShelf` 候选卡片。
- AI 候选按钮仍只执行 `setAnchorDraft(reply.text)`，选中后填入主播回复框供主播修改；不会自动新增聊天气泡、标记已发送或调用抖音发送接口。
- 定向契约 `test-chat-ui.cjs`、响应式契约 `test-chat-reply-responsive.cjs`、候选持久化/增强测试、`npm test`、隔离目录生产构建和 `git diff --check` 均通过。
- 浏览器 3102 已复核顶部关系摘要、中部聊天记录、底部回复区和候选卡片；页面无编译错误。UI 静态规则检查仍会报告聊天 CSS 原有的颜色字面量基线问题，未将其误判为本阶段新增回归；exec 沙箱的 `inspect_runtime.py` 无法连接 localhost，浏览器复核作为运行时证据。

## 2026-10-03 回复工作区 UI 错位修复

- 根因是 textarea 仍只继承旧 `.composer textarea` 样式，新 `.replyComposer` 下没有宽度规则，浏览器按原生窄 textarea 渲染。
- 增加 `.replyComposer textarea` 的宽度、块级显示、最小高度、边框和暗色样式；新增响应式契约，防止后续重排再次丢失输入框宽度。
- 修复前 `node test-chat-reply-responsive.cjs` 按预期失败，修复后 `node test-chat-reply-responsive.cjs`、`node test-chat-ui.cjs`、`git diff --check` 和浏览器 3102 重新加载复核均通过。

## 2026-10-03 聊天标题与关系资料头部合并

- 移除重复的独立聊天标题栏，将当前对象头像、昵称、左右聊天说明、时间线事件数和“主播确认制”放入关系资料同一头部；下方只保留一个资料展开入口。
- 删除重复显示的对象昵称与解释性关系资料摘要，进一步压缩顶部占用，聊天正文获得更多高度；详细画像、维护任务和关系时间线仍在折叠区内。
- 先新增合并头部 UI 契约并确认旧结构下按预期失败；修复后定向测试、`npm test` 全量回归、隔离生产构建和 `git diff --check` 通过。

## 2026-10-03 Runtime 错误提示残留修复

- 根因是回复区直接渲染全局 `error` 状态；一次旧的 `goutoujunshi Runtime 输入不完整` 失败会一直占据候选区，切换维护对象或录入新消息后仍可能看到旧提示。
- 新增 `lib/chat-error-state.cjs`，将 AI/开场错误绑定到当前维护对象和当前已确认的大哥消息；切换对象、恢复工作区、确认新消息和刷新账号会清理旧错误，其他任务/识别错误仍保留在当前对象范围内。
- 错误容器增加 `role="alert"`，只显示与当前对象/消息匹配的错误；候选列表和历史恢复逻辑不变。
- 新增错误作用域回归测试；`npm test` 全量通过，复制依赖到可写临时目录后的 `npm run build` 通过，`git diff --check` 通过；浏览器 3102 刷新后红色 Runtime 残留不再显示，已恢复 AI 候选。

## 2026-10-03 Runtime 输入不完整真实失败修复

- 浏览器点击“生成 AI 回复”复现到真实接口失败；服务端日志先暴露为 `ACTIVE_USER_REQUIRED`，确认不是欠费或旧提示残留。
- 根因有两层：登录态服务端对象同步失败时曾把本地 clientId 回退为服务端对象 ID；更关键的是 Runtime 输入清洗只保留 `actor.userId`，而 auth-store 权限校验按 `actor.id` 查找主播，导致长期记忆状态检查失败。
- `ensureServerBrother` 现在在登录态同步失败时返回空值，不再把本地 ID 伪装成数据库 UUID；Runtime actor 同时保留 `id` 与 `userId`，跨 Runtime 命名空间和 auth-store 权限契约均可用。
- 服务端错误日志补充安全的 `Error.message` 诊断信息，但浏览器仍只收到脱敏错误文案。
- Runtime 错误响应按 `ACTIVE_USER_REQUIRED`、对象作用域错误和真正的 `RUNTIME_SCOPE_REQUIRED` 分流，避免权限/同步故障再次显示成输入不完整。
- 回归测试先按预期失败，再修复通过；浏览器 3102 实际点击生成已无 `goutoujunshi Runtime 输入不完整`，AI 候选正常保留并显示“候选已保存”。
- 清理了联调期间临时录入的单条测试消息；未保留测试数据。

## 2026-10-04 管理账号个人聊天作用域隔离

- 修复超级管理员打开 `/chat/` 时看到其他主播聊天的问题：个人聊天页现在仅对主播账号加载服务端维护对象和本机快照，管理账号不会恢复上一账号的聊天内容，也不会请求全量维护对象。
- 运营和超级管理员在 `/chat/` 看到明确的“进入运营后台”入口；指定主播的查看仍走后台的只读预览，不改变管理审计、审批和只读查看权限。
- 新增认证作用域回归断言；`npm test` 全量通过，隔离目录 `npm run build` 通过，`git diff --check` 通过。

## 2026-10-04 左侧大哥消息专项 AI 回复

- 新增本轮回复目标选择器：最新确认的大哥消息自动选中；聊天记录中每条已确认的左侧大哥消息都可点击“针对这条回复”，选中后候选、画像判断和 Runtime `currentMessage` 均绑定该条正文。
- 选择新目标会清除旧候选和旧分析，避免上一条消息的候选错配；截图导入和手动录入也会自动把最新大哥消息设为目标。
- 新增目标选择器单元测试和 UI 契约；`npm test` 全量通过，隔离目录生产构建通过，`git diff --check` 通过。

## 2026-10-05 回复候选区桌面排版错位修复

- 根因是桌面 `.layout` 使用固定视口高度，`.chat` 隐藏溢出，`.replyWorkspace` 又限制为 `max-height:48%` 并开启内部滚动；候选卡片因此被裁切，截图中只剩部分按钮且左侧工作区看起来被挤压。
- 桌面端改为页面自然展开，聊天记录单独使用有上限的滚动容器；回复工作区取消高度和溢出裁切，候选卡片统一最小高度并让“选用这条”按钮落在卡片底部。手机端原有纵向布局规则保持不变。
- 新增 `test-chat-layout.cjs` 回归契约；修复前按预期失败，修复后该测试、响应式测试、全量 `npm test`、隔离目录生产构建和 `git diff --check` 均通过。
- 3102 浏览器刷新后的运行时截图显示：左侧维护对象、聊天记录、主播回复区和 AI 候选区按“左侧工作区 / 右侧候选”稳定对齐，候选卡片可自然向下滚动，不再被回复区父容器截断。

## 2026-10-05 移除实际发送勾选步骤

- 删除主播回复区的“我已在抖音实际发送”复选框及对应 React 状态和前置拦截。
- 保留“④ 标记已发送”作为主播手动记录动作；只要回复输入框有内容即可点击，仍不会调用抖音发送接口。
- `test-chat-ui.cjs` 先按预期捕获旧勾选契约失败，移除后通过；全量 `npm test`、隔离目录生产构建和 `git diff --check` 均通过。
## 2026-10-05 管理入口按钮间距修复
- authGate 管理账号入口和退出按钮新增独立 flex 分组，间距 token 12px，窄屏自动换行。
- 事件与权限逻辑保持不变；聊天界面、认证状态和登录入口契约测试通过。

## 2026-10-05 核心链路稳定性与角色工作区阶段完成
- 修复 AI 候选错配：服务端按当前 `sourceMessageId` 重建消息上下文，前端生成请求增加对象/消息/批次校验；旧请求返回时丢弃，不再覆盖新候选。
- 修复刷新与恢复边界：快照、回复历史均保存目标消息 ID，目标不一致的历史候选不会恢复到当前候选区。
- 运营与最高管理拥有按账号隔离的个人聊天工作区；主播、运营、最高管理的个人数据不互相复用，管理端仍可按权限只读查看主播工作台。
- 超级管理员保留审批、全量操作审计、用户管理，并新增工具使用页（API 调用状态、耗时、成功率、服务运行状态）；运营复盘增加主播使用率/回复率。
- 运营/最高管理只读主播工作台新增内部维护点评；主播端不显示运营备注。
- 维护任务卡新增是否采用建议参与本轮 AI 生成的选择，任务方向作为提示上下文，不越过 Runtime 事实和安全边界。
- 验证：`npm test` 退出码 0；隔离目录生产构建通过；3102 页面复核通过；`git diff --check` 通过。

## 2026-10-05 审批隔离与私有 API 缓存修复

- Service Worker 不再缓存同源 `/api` 响应，并按注册 scope 处理非根路径部署；避免登录态、审批待办和聊天快照按 URL 串线。
- 认证、审批、用户列表和运行状态等 API 显式返回 `private, no-store`，保留现有服务端角色校验。
- 审批中心将超级管理员的运营申请队列与主播申请队列独立加载；一条队列失败不会隐藏另一条，运营审批后当前可见队列会同步刷新。
- 定向验证：`node test-service-worker.cjs`、`node test-approval-isolation.cjs`、`node test-auth-api.cjs`、`node test-admin-ui.cjs`、`node test-super-admin-approval-api.cjs`、`node test-super-admin-approval-ui.cjs` 均通过；`git diff --check` 通过。
- 两轮规格/质量审查均通过；该阶段后续已完成只读工作台、维护任务和游客工作台实现，详见下方 2026-10-05 阶段记录。

## 2026-10-05 审批、只读、维护任务与游客工作台阶段完成

- 审批队列已按运营申请/主播申请独立加载，Service Worker 和私有 API 响应不再缓存账号相关内容；超级管理员可直接处理两类审批。
- 只读主播工作台先复用当前正式登录会话，再请求服务端快照；运营只能查看自己管理的主播，超级管理员可查看全部，未登录和越权仍分别返回 401/403。
- 维护任务支持按角色范围手动创建，人工任务 `sourceMessageId` 为空，`requestId` 幂等，创建和 `chat.task.create` 审计在同一事务内；聊天页可控制是否将任务建议带入 AI。
- 游客手机号登录不创建正式用户，只保存手机号 HMAC；游客会话使用独立 Cookie，登录、业务请求、退出和服务启动会触发 24 小时懒清理，活跃请求续期 Cookie。
- 游客工作台只使用 `guest:<匿名 ID>` 本地命名空间，退出时清理当前临时聊天、候选、回复历史和草稿；游客 `/api/profile` 请求不接受正式维护对象/消息/任务 ID，不写正式使用统计或审计，仍走 goutoujunshi Runtime → GLM-5.3。
- 验证证据：`npm test` 退出码 0（包含 `test-guest-profile-api.cjs` 的游客 Runtime→GLM 模拟链路与正式 ID 拒绝测试）；游客/认证/聊天/API 定向测试、维护任务和审批测试通过；`git diff --check` 通过；隔离临时副本 `npm run build` 通过。
- 限制：未进行真实外部智谱 API 调用、Windows 10 部署验证或真实浏览器 Service Worker 缓存运行时复核；构建验证使用了临时副本，未触碰 3102 服务和真实数据库。

## 2026-10-05 Runtime 安全误报修复

- 根因：`validateGenerationAgainstRuntime` 之前扫描 GLM 返回的整个 JSON；`rationale`、`observationWindow` 和 `stopCondition` 中用于解释“不诱导礼物/不推断敏感属性”的安全说明，会被误判成主播要发送的越界内容。
- 修复：安全校验只检查真正可复制发送的 `replies[].text` 与 `liveInvite.text`，不放宽真实候选中的刷礼物、转账、借钱、充值、虚假依赖和敏感属性推断拦截。
- 回归：新增安全边界误报测试；先按预期失败，再修复通过；`npm test` 与 `git diff --check` 均通过。

## 2026-10-05 提示词边界文案收敛

- 移除发送给 GLM 的具体礼物/健康等敏感清单式文案，改为“尊重隐私与自主决定”“不把压力转化为义务或回报”等自然表达，避免安全条款污染候选说明。
- 仅调整模型提示词和测试契约；服务端对真实消费诱导、虚假依赖和敏感属性推断的硬拦截保持不变。
- `test-api.cjs` 和 `npm test` 全量通过。

## 2026-10-05 生产化基线阶段

- 新增 `scripts/verification/discovery.cjs`、`scripts/verification/runner.cjs` 和 `scripts/verify.cjs`，统一发现并逐个隔离运行根目录 `test-*.cjs`，失败、超时、空测试集和敏感环境继承均有契约测试。
- `package.json`、`package-lock.json` 与 CI 统一声明 Node `>=22.0.0`；这是 `better-sqlite3` 当前运行时要求，避免 CI 使用 Node 20 时与本地环境不一致。
- `npm test` 当前实际发现并执行 84 项测试（包含此前长命令遗漏的角色工作区测试），全部通过；`git diff --check` 通过。
- 仍未宣称生产验收：当前工作区构建受正在使用的 3102 开发服务和 `.next/trace` 文件锁影响，需在独立、无服务占用的副本中完成构建；真实 GLM、Windows 10 局域网和浏览器端到端仍单独验证。

## 2026-10-05 回复完整性阶段

- 新增 `test-chat-source-boundary.cjs`，先复现空来源、跨维护对象来源、未确认来源和伪造正文均可进入保存链路的问题，再完成服务端修复。
- `lib/auth-store.cjs` 将来源校验集中到 `confirmedSourceMessageForBrother`：必须是当前维护对象、当前主播所有者、已确认的大哥消息；回复历史的正文以数据库原文为准，工作台候选有内容时必须绑定有效来源。
- `/api/chat/reply-history/` 与 `/api/chat/workspace-snapshots/` 对非法来源返回 409；`/api/profile/` 的正式账号缺失来源时不会调用 AI。
- 对象切换会清空旧画像/分析/候选；回复历史异步保存带生成批次校验，旧对象结果不会写入当前界面。
- 本阶段定向测试和全量 `npm test` 通过；全量实际发现并执行 86 项测试，全部通过；`git diff --check` 通过。
- 将 Node 22 写入 `.nvmrc`；在排除实时服务和真实数据库的独立副本中补齐 `data/scripts.json` 后，`npm run build` 通过。第一次使用外部 `node_modules` 符号链接的构建被 Turbopack 拒绝，改为真实依赖副本后通过。

## 2026-10-05 管理员初始化安全阶段

- 新增 `test-bootstrap-admin-safety.cjs`，先复现旧脚本可重复创建第二个最高管理员的问题，再完成修复。
- `ensureBootstrapAdmin` 现在只对同一活动最高管理员幂等；已有活动最高管理员的新手机号返回 `BOOTSTRAP_ADMIN_EXISTS`，已有其他角色手机号返回 `BOOTSTRAP_PHONE_CONFLICT`，脚本返回非零状态并不泄露敏感信息。
- `test-auth-store.cjs`、`test-auth-api.cjs`、管理员安全测试和全量验证均通过；全量验证实际发现 87 项并全部通过，强制重置和恢复流程仍未实现。
- 独立构建产物编译通过；尝试在受控环境启动临时 `next start` 时被沙箱拒绝监听新端口（`listen EPERM`），现有 3102 服务未重启。

## 2026-10-05 浏览器回归契约与认证限流阶段

- 新增 `docs/production/BROWSER-REGRESSION.md` 和 `test-browser-regression-contract.cjs`，固定合成账号、临时数据库、临时端口、登录/权限/刷新恢复/候选来源绑定/账号隔离的浏览器验收边界；不把静态契约测试冒充真实浏览器通过。
- 登录、注册和游客登录接入 SQLite `rate_limit_buckets` 事务限流；每个入口同时按请求来源与规范化账号建立不可逆摘要桶，返回 429、`AUTH_RATE_LIMIT` 和 `Retry-After`，未显式启用可信代理时不接受客户端伪造的转发地址。
- 认证限流测试先按预期复现第三次错误请求返回 401 的旧行为，再修复为 429；覆盖登录、注册、游客入口、响应脱敏和伪造 `X-Forwarded-For` 不绕过。
- 验证：`npm test` 实际发现并执行 91 项，全部通过；`node test-auth-rate-limit.cjs`、`node test-browser-regression-contract.cjs`、`git diff --check` 通过。独立副本生产构建已通过。
- 环境边界：尝试启动隔离 `next start` 到 `127.0.0.1:3210` 返回 `listen EPERM`，因此真实浏览器流程仍待允许临时监听的环境执行；现有 3102 服务未停止。

## 2026-10-05 认证默认策略阶段

- 先新增 `test-auth-default.cjs`，在旧实现下复现“生产环境未配置 `AUTH_REQUIRED` 时仍匿名放行”的失败；修复后覆盖生产默认、开发默认和显式覆盖三种边界。
- `authRequired()` 现在以显式 `AUTH_REQUIRED=true/false` 为最高优先级；未显式配置时生产环境默认要求登录，开发环境保留本地预览兼容性。
- 健康检查、AI 入口和相关受保护入口统一使用策略函数，避免环境变量直接读取造成 UI 与 API 策略不一致。
- 当时仅完成认证默认策略；密码恢复随后在管理员密码恢复阶段补齐，生产实机演练仍另行待验收。

## 2026-10-05 数据库迁移账本与备份边界阶段

- 新增 `lib/db-migrations.cjs`：为当前 auth/chat schema 建立 `schema_migrations` 基线 `0001.auth-store-baseline`，支持幂等重开、唯一版本、checksum 校验和迁移执行失败不落账。
- `lib/auth-store.cjs` 在现有 schema 初始化和兼容列补齐后记录基线；已有数据库只采用当前实际 schema，不执行隐式破坏性迁移。后续结构变更必须登记新 migration id，重复 id 的 checksum 变化会阻止启动。
- 新增 `lib/db-backup.cjs` 与 `scripts/db-backup.cjs` / `npm run db:backup`：通过 SQLite 在线 backup API 生成一致性副本，默认拒绝覆盖已有目标，副本执行 `PRAGMA integrity_check` 和迁移账本校验后才报告成功，源库以只读方式打开。
- `test-db-migrations-backup.cjs` 先验证迁移 checksum 冲突和备份边界，再验证基线、重开幂等、源库哈希不变和覆盖保护；定向测试通过，`git diff --check` 通过。
- 新增 `lib/db-recovery.cjs` 和 `scripts/db-restore-verify.cjs`，恢复只允许写入不存在的新目标，恢复后校验完整性、迁移账本和关键账号记录；目标已存在时拒绝覆盖。
- 生产边界：尚未完成 Windows 10 定时/异地备份、加密存储、生产恢复切换、升级回滚或多实例共享迁移；这些仍不能标记为商用验收。

## 2026-10-05 管理员密码恢复阶段

- 先新增 `test-password-recovery.cjs`，在旧实现下按预期复现恢复存储/API 不存在的 RED；随后补齐最小受保护流程并保持现有登录、审批和初始化接口兼容。
- 新增 `password_reset_tokens` 迁移（`0002.password-reset-tokens`）：活动超级管理员可为运营/主播签发短时一次性 token，数据库仅保存 SHA-256 摘要；同一目标重新签发会使旧 token 失效。
- 新增 `POST /api/admin/users/:userId/password-reset` 和 `POST /api/auth/password-reset`。不提供手机号匿名申请，不允许为自己或其他最高权限账号发起；消费成功在同一事务内更新密码、标记 token 已消费、撤销目标账号全部会话并写入审计。
- 审计只记录目标角色与撤销会话数量，既不记录密码也不记录原始 token；错误响应统一脱敏，恢复接口另有来源限流。
- 定向验证：`node test-password-recovery.cjs`、`node test-db-migrations-backup.cjs`、`node test-auth-api.cjs`、`node test-user-management-api.cjs` 和 `git diff --check` 通过。Windows 实机恢复通知、管理员失联和多实例共享存储仍待后续验收。

## 2026-10-05 Windows 10 局域网部署准备阶段

- 先写 `test-windows-deploy-config.cjs`，覆盖 Node 版本、生产认证、独立数据库路径、端口/绑定地址、HTTPS Cookie 约束、Windows 路径和密钥不泄露；测试在缺脚本时先红，补齐后绿。
- 新增 `lib/windows-deploy-config.cjs` 与 `scripts/windows-deploy-check.cjs`。校验只输出非敏感摘要和稳定错误码，不打印 API Key、Cookie 或请求正文；未配置生产变量时命令明确失败，不自动放宽认证。
- 新增 `scripts/windows/start-huashu.ps1`、`stop-huashu.ps1` 及 `.cmd` 包装器。启动显式设置生产认证、独立数据库、监听地址和端口；停止默认只查看监听进程，`-Force` 前还要求进程命令行包含指定应用目录，避免误杀其他服务。
- 部署检查会在进程环境未提供 Key 时，仅读取应用目录受保护 `.env.local` 的“是否已配置”状态，不返回或打印密钥；因此超级管理员保存配置后重启仍能通过启动前检查。
- 定向验证：`node test-windows-deploy-config.cjs`、带合成环境变量的 `node scripts/windows-deploy-check.cjs`、`git diff --check` 通过；没有启动/重启服务或触碰 3102。
- Windows 10 实机、服务托管、防火墙、HTTPS、断电恢复和升级回滚仍未验收；源码契约和 macOS 测试不等于 Windows 运行时通过。

## 2026-10-05 Runtime 唯一入口阶段

- 旧首页删除浏览器侧 `analyzeGoutoujunshi` 正式分析调用和 `relationshipState` 请求字段；页面只收集输入并渲染服务端返回的 Runtime 状态。
- `/api/profile` 继续从当前账号、维护对象和 `sourceMessageId` 重建正式上下文；客户端提交的关系状态不作为权威输入。回归测试注入伪造核心标识后，GLM 请求仍使用服务端 `goutoujunshi` revision。
- 新增并接入 `test-runtime-single-entry.cjs`，同步更新页面生成契约，保留 `algorithmCore`、回复偏好和历史重新生成能力。
- 验证：`npm test` 实际发现并执行 95 项，全部通过；`node test-runtime-single-entry.cjs`、`node test-generation-contract.cjs`、`node test-api.cjs`、`git diff --check` 和独立副本 `npm run build` 均通过。
- 本阶段没有真实智谱请求、浏览器端到端或 Windows 10 局域网实机验收；3102 服务未停止或重启。

## 2026-10-05 Runtime UI 投影阶段

- 发现旧首页仍会在服务端响应前把本地 `analyzeBrotherQuote` 写入正式分析状态，存在“本地预判冒充 Runtime 结果”的显示风险。
- 新增 `lib/runtime-ui-projection.cjs`，只从服务端 `analysis` 优先、`relationshipState` 兼容回退生成旧首页展示字段，保留事实、未知、主目标、风险、情绪、行动、停止条件和算法标识。
- 旧首页生成前清空正式分析；成功后只写入 Runtime 投影；失败时清空旧分析，不再保留上一轮关系状态。
- 新增纯函数和页面契约测试；全量 `npm test` 实际发现并执行 97 项，全部通过；独立副本生产构建和 `git diff --check` 通过。
- 本阶段仍未进行真实智谱调用、真实浏览器端到端或 Windows 10 局域网实机验收。

## 当前阶段：回复历史 Runtime 上下文持久化（2026-10-05）

目标：让每一批 AI 候选与生成时的 `goutoujunshi Runtime` 状态绑定保存，恢复历史时不再出现候选、当前消息和分析依据错配。

- [completed] Task 1：新增 0003 SQLite migration，扩展 store/API 的 Runtime 五组字段并通过往返测试
- [completed] Task 2：登录用户和游客候选历史保存完整上下文，恢复时还原 Runtime 面板、话题和邀请
- [completed] Task 3：更新生产状态/测试文档，完成全量测试、差异检查和隔离生产构建

### 本阶段验证证据

- `test-chat-reply-history-runtime-context.cjs`、`test-chat-reply-history-runtime-ui.cjs`：通过。
- `npm test`：99/99 通过；包含 migration、API 往返、访客归一化和 UI 恢复契约。
- `git diff --check`：通过；隔离临时副本 `npm run build`：通过（未触碰当前 3102 和正式 SQLite）。
- 真实浏览器刷新、真实智谱、Windows 10 数据库升级/回滚仍为 PENDING。

## 当前阶段：浏览器回归安全前置（2026-10-05）

目标：在真实浏览器回归开始前，阻断误连 3102、正式数据库和真实凭据，建立可审计的临时测试入口。

- [completed] Task 1：为合法/危险环境编写 preflight RED 测试
- [completed] Task 2：实现纯函数校验和 CLI，输出稳定错误码与脱敏摘要
- [completed] Task 3：更新浏览器回归方案并完成定向验证
- [completed] 全量回归与隔离生产构建

### 本阶段验证证据

- `test-browser-regression-preflight.cjs`：通过。
- `npm test`：100/100 通过。
- `git diff --check`：通过；隔离临时副本 `npm run build`：通过。
- 真实浏览器交互仍为 PENDING；当前环境未启动临时端口，也未触碰 3102。

## 当前阶段：Agent Browser 冒烟适配（2026-10-05）

目标：把 preflight 后的真实浏览器登录页可达性检查做成默认关闭、显式启用、无凭据传递的可选执行器。

- [completed] Task 1：编写 runner 安全契约测试
- [completed] Task 2：实现 `npm run browser:smoke` 和隔离 session 生命周期
- [completed] Task 3：全量回归、隔离构建和文档证据归档

### 本阶段验证证据

- `test-agent-browser-smoke-contract.cjs`：通过。
- `npm test`：101/101 通过。
- `git diff --check`：通过；隔离临时副本 `npm run build`：通过。
- 真实执行分支返回 `AGENT_BROWSER_NOT_FOUND`，未伪造浏览器通过，也未启动或重启 3102。
