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
