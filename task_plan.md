# 任务计划：后台三页、用户状态与主播只读工作台

## 目标

在保持现有登录、聊天同步和 AI 链路可用的前提下，将后台拆为审批中心、按操作者分类的操作日志和超级管理员用户管理，并同步主播最新草稿/AI 候选供授权管理者只读查看。

## 阶段

- [completed] 阶段 1：用户状态统计、停用/恢复/永久删除存储契约
- [completed] 阶段 2：操作日志按操作者分组 API 和页面
- [completed] 阶段 3：审批中心收敛与用户管理页面
- [completed] 阶段 4：主播最新工作台快照同步与只读查看 API
- [completed] 阶段 5：主播/管理端 UI 接入和只读写保护
- [completed] 阶段 6：完整回归、真实 3102 链路和交付

## 当前决策

- 永久删除采用超级管理员二次点击确认，不要求输入手机号；服务端仍生成短时绑定目标的确认令牌，不能靠直接构造 DELETE 绕过页面确认。
- 停用是可恢复的软状态变更，保留聊天、快照和审计；停用立即撤销全部会话。
- 永久删除清理用户、会话、工作台快照、维护对象和聊天消息；审计保留脱敏操作者/目标快照。
- `/admin` 只显示审批；`/admin/audit` 按运营/主播分组；`/admin/users` 仅超级管理员。
- 草稿停顿约 2 秒同步，AI 候选生成成功立即同步；每个维护对象只保留最新一批候选。
- 管理端只读查看不允许输入、生成、复制、标记已发送或修改快照。

## 错误记录

| 错误 | 原因 | 处理 |
| --- | --- | --- |
| `npm run build` 在当前 worktree 的 `.next/trace` 报 EPERM | 已运行服务或受保护的旧 `.next` 文件阻止直接覆盖 | 在不接触真实数据库的临时构建目录完成生产构建并通过；真实回环服务使用同一临时构建验证 |
| 规格自检命令的正则写法错误 | `???` 被 rg 当成重复量词 | 改用固定字符串扫描，未发现占位符；不影响代码或规格内容 |
| 规格自检占位符扫描正则再次报错 | `???` 作为正则量词导致 `rg` 解析失败 | 规格文件内容已输出并使用固定字符串命令复核；不影响规格或代码 |

## 验证证据

- 前置基线：审计查看页实现提交 `b93d553`，设计提交 `a7e8712`、`ebd835b`。
- 已执行：`npm test`、临时隔离目录 `npm run build`、`git diff --check`、真实回环 3102 页面/登录/权限链路、四个页面运行时 UI 检查。

## 后续阶段：统一后台页面 UI（2026-09-30）

- [completed] 统一审批、日志、用户管理三页的页壳、导航、身份信息、色彩与文字层级
- [completed] 整理日志列表、用户管理列表与危险操作弹窗的响应式样式和交互状态
- [completed] 真实桌面/手机截图复审、权限行为回归、生产构建与静态检查

范围仅限后台三页；聊天工作台及后端权限逻辑不变。运行时检查、全量测试与临时生产构建均已通过。

## 后续阶段：维护任务中心（2026-10-02）

- [completed] 确认大哥消息后自动建立“待回复”任务，主播实际标记发送后自动完成
- [completed] 增加待回复、待跟进、稍后处理、已完成、已忽略状态与安全迁移规则
- [completed] 增加 `/api/chat/tasks/` 角色范围接口：主播可更新自己的任务，运营和最高管理只读查看授权范围
- [completed] 增加聊天页当前对象任务卡与独立 `/tasks/` 手机适配任务中心，支持暗色主题
- [completed] 定向任务模型、存储、API、UI 契约测试、全量回归与隔离生产构建

任务只记录建议跟进和主播确认结果，不自动发送抖音消息、不读取抖音后台；AI 的下一步建议仍由现有画像链路生成并由主播确认。

## 后续阶段：超级管理员全量审批（2026-10-02）

- [completed] 超级管理员可查看全部运营名下的待审批主播申请
- [completed] 超级管理员可直接批准或拒绝主播申请，主播原运营绑定关系保持不变
- [completed] 运营继续只能查看和处理自己名下主播申请
- [completed] 审批中心拆分待审批运营与待审批主播两条队列，并保持加载、错误、空状态和按钮反馈
- [completed] 存储、API、UI 定向测试与全量回归

## 当前阶段：聊天工作台人性化增强（2026-10-02）

目标：在现有微信式聊天、画像、AI 回复和维护任务基础上，增加上下文检索、关系记录、AI 风格控制、发送前边界检查、跟进建议和运营内部备注。

- [completed] 阶段 1：数据边界、领域模型与失败测试
- [completed] 阶段 2：聊天搜索、收藏、置顶和关系时间线存储/API
- [completed] 阶段 3：AI 回复风格控制与发送前自然度/边界检查
- [completed] 阶段 4：下次跟进建议与运营内部备注
- [completed] 阶段 5：聊天 UI、手机端交互、暗色主题与权限门禁
- [completed] 阶段 6：全量回归、隔离生产构建和浏览器复审

当前决策：

- 搜索只检索主播自己有权访问的维护对象和聊天正文；运营/最高管理只检索各自可见的只读范围。
- 收藏、置顶、关系时间线和运营备注都属于服务端数据；运营备注与主播可见聊天严格分开。
- AI 风格是生成参数和提示约束，不保存 API Key，不自动发送；发送前检查只返回提示和建议，不替主播做最终选择。
- 时间线只记录主播主动确认的事件和手工备注，不推断敏感属性，不读取平台后台。

交付证据：`npm test` 全量通过；隔离目录生产构建通过；回环浏览器复审确认搜索、回复风格、发送前检查、关系时间线、运营备注和暗色主题控件均可访问。3102 现有进程可能仍来自旧工作树，需重启到本工作树后才能看到本阶段界面。

## 后续阶段：GLM-5.3 与 OCR 合成样本联调（2026-09-30）

- [completed] 固化本地联调设计、数据边界和错误分类
- [completed] 为联调脚本补充失败契约测试和合成 OCR 图片
- [completed] 实现 AI/OCR 本地 smoke 脚本、命令入口和脱敏输出
- [completed] 在无 Key 与有 Key 环境分别验证，记录真实联调边界

本阶段不读取真实抖音、不上传真实私信、不新增网页诊断入口。离线链路和隔离生产构建通过；当前本机实测因服务未配置 `ZAI_API_KEY`，真实 AI/OCR 未宣称通过。

## 后续阶段：超级管理员 AI 服务配置（2026-10-01）

- [completed] 统一 Provider 配置、请求和错误映射
- [completed] 增加超级管理员服务配置与测试调用 API
- [completed] 增加服务配置页并收敛普通页面为只读状态
- [completed] 全量测试、UI 检查、隔离生产构建与本地无 Key 验证

本阶段实现已完成：`npm test`、管理员设置页/UI 契约、Provider 契约、隔离目录 `npm run build` 和 `git diff --check` 均通过；浏览器回环页已确认后台服务配置导航与聊天页只读服务状态渲染。未配置 Key 的真实调用仍按 `ZAI_API_KEY_MISSING` 处理，不宣称外部 AI 权限已验证。收尾 CLI smoke 在受限 exec 环境返回 `NETWORK_UNAVAILABLE`，不作为应用故障结论。

## 后续阶段：服务配置保存边界修复（2026-10-01）

- [completed] 修复设置页“留空保留已有 API Key”与服务端校验顺序冲突
- [completed] 增加临时配置文件回归测试，确认恢复 Key 后响应仍不泄露密钥
- [completed] 全量测试、隔离生产构建和差异空白检查

本阶段仅改动服务端配置恢复逻辑：提交空 Key 时优先沿用当前进程 Key，再从配置文件恢复；没有 Key 时仍明确返回缺失错误。隔离构建首次使用跨目录 `node_modules` 软链接触发 Next/Turbopack 文件系统边界错误，改为复制依赖后构建通过。

## 后续阶段：设置页会话过期反馈修复（2026-10-02）

- [completed] 复现未登录/会话失效时表单仍可见、点击后无明显反馈的问题
- [completed] 增加权限状态门禁，未授权不再渲染保存/测试表单
- [completed] 设置接口返回 401 时进入登录流程，并提供返回登录入口
- [completed] 全量测试、隔离生产构建和差异空白检查

根因是页面在权限请求失败后仍由 `finally` 关闭 loading，导致未授权表单被渲染；修复后设置页只在 `access === "granted"` 时显示可操作内容。真实 API Key 未在本轮浏览器操作中读取或重新提交。

## 后续阶段：GLM-5.3 测试调用参数修复（2026-10-02）

- [completed] 复现测试请求因 `thinking.type = "disabled"` 失败
- [completed] 改为 GLM-5.3 兼容的 `thinking.enabled + reasoning_effort.low`
- [completed] 移除连通性测试对结构化 JSON 输出参数的额外依赖
- [completed] 为上游请求参数错误增加明确的安全提示
- [completed] 全量测试、隔离生产构建和差异空白检查

本阶段只修正测试调用链；画像正式调用原本已使用启用思考和低推理强度。浏览器中的旧失败提示需要刷新页面后重新测试，未代用户重新提交真实 Key 或触发外部调用。

## 后续阶段：欠费误判分类修复（2026-10-02）

- [completed] 追踪配置、测试请求、上游错误分类和页面状态，区分旧缓存与真实响应
- [completed] 仅在上游明确提供账务/余额/额度证据时显示欠费；其他 `1113` 拒绝显示为模型/套餐/参数待排查
- [completed] 增加脱敏的上游状态/错误码诊断，不返回 Key 或原始响应
- [completed] 全量回归与隔离生产构建验证

本阶段已完成误判修复。当前页面刷新后为“已读取配置”，实际外部 API 权限仍需在用户网络环境中点击“测试调用”验证；受限 CLI 沙箱的网络失败不作为应用欠费结论。

## 后续阶段：聊天画像素材输入（2026-10-02）

- [completed] 聊天页增加默认折叠的作品文案、近期评论、公开发言输入区
- [completed] 将素材随当前消息、历史和授权确认送入现有 goutoujunshi → GLM-5.3 链路
- [completed] 本地记忆与主播服务端工作台快照保存/恢复画像素材
- [completed] 定向契约、全量测试、隔离生产构建和本地聊天页运行检查

范围保持为主播授权的纯文本输入，不读取抖音后台、不上传平台凭据、不改变自动发送边界。

## 后续阶段：截图左右气泡识别与聊天复现（2026-10-02）

- [completed] OCR 根据截图宽度和气泡 bbox 自动判断左侧大哥、右侧主播，并按纵向位置排序
- [completed] 对居中、单侧或缺少坐标的内容保留“未判断”，要求主播人工确认后才能写入
- [completed] 增加“按截图顺序写入聊天”，批量写入时保留左右方向、上下顺序和截图识别来源；右侧消息不自动标记为抖音已发送
- [completed] OCR API 传递前端读取的截图尺寸，更新 OCR smoke 校验、聊天 UI 契约与全量回归

本阶段仍只处理主播主动上传的截图；图片不落盘，识别结果逐条确认后才进入维护对象聊天记录。

## 后续阶段：回复候选闪退与主播数据隔离修复（2026-10-02）

- [completed] 复现并锁定旧工作台快照异步回写覆盖新候选的竞态
- [completed] 增加按主播、维护对象和生成批次保存的回复历史接口与回溯面板
- [completed] 将本地聊天记忆与记忆开关改为按登录用户命名空间，避免主播间共用浏览器历史
- [completed] 保留服务端 `chat_brothers`、消息、任务、快照和回复历史的主播归属权限
- [completed] 回归测试、全量测试与隔离生产构建

本阶段仍不自动发送抖音消息；回复历史保存的是 AI 候选和当时上下文，主播恢复后仍需人工修改、复制并确认已在抖音发送。

## 后续阶段：暂时隐藏截图识别入口（2026-10-02）

- [completed] 主播聊天工作台暂时不渲染截图上传、识别预览和批量写入入口
- [completed] 保留 OCR 适配器、API、左右归属算法和契约测试，后续升级只需重新打开功能开关
- [completed] 增加关闭状态回归断言并完成全量测试与隔离生产构建

## 后续阶段：修正误粘贴聊天内容（2026-10-02）

- [completed] 主播可在聊天气泡下方进入修改态，保存前可继续调整文字或取消
- [completed] 修改后的消息更新本地记录，并通过服务端 PATCH 接口同步
- [completed] 主播可修改未发送和已发送消息；已发送消息保留 `sent` 状态与原发送时间，运营和超级管理员保持只读
- [completed] 记录修改审计事件，补充领域、API、UI、全量测试与生产构建

## 当前阶段：goutoujunshi 本地运行时复刻（2026-10-03）

- [completed] 盘点上游 Skill 结构、五步流程、渐进式知识路由和记忆脚本
- [completed] 完成并提交运行时级复刻设计文档 `docs/superpowers/specs/2026-10-03-goutoujunshi-runtime-design.md`
- [completed] 用户审阅并确认设计文档
- [completed] 编写实现计划 `docs/superpowers/plans/2026-10-03-goutoujunshi-runtime.md`
- [completed] Task 1：Runtime 输入规范化和证据边界
- [completed] Task 2：上游参考 manifest 与渐进式披露
- [completed] Task 3：建档、五阶段决策引擎和行动契约
- [completed] Task 4：服务端隔离长期记忆
- [completed] Task 5：Runtime 编排器和记忆 API
- [completed] Task 6：profile API 改为 Runtime 链路

## 当前阶段：固定版聊天工作台排布（2026-10-03）

- [completed] 用户确认固定版排布方案：顶部关系资料、中部聊天记录、底部主播回复与 AI 候选
- [completed] 建立 `relationshipDock`、`relationshipHeader`、`replyWorkspace`、`aiCandidateShelf` UI 契约
- [completed] 重排 `ChatWorkspace`，保留候选选择填入主播回复框的既有行为
- [completed] 增加桌面、平板和手机端响应式排布，取消候选列表固定高度裁切
- [completed] 完成定向测试、全量测试、隔离生产构建、差异检查和 3102 浏览器复核

## 当前阶段：核心聊天链路稳定性与角色工作区（2026-10-05）

目标：先修复 AI 候选错配/消失和历史串线，再实现超级管理员全量审批、运营复盘统计和运营/管理员独立聊天空间，最后补充维护任务参与生成。

- [completed] 阶段 1：复现 AI 候选竞态、快照缺少目标消息绑定和账号作用域问题，先写失败测试
- [completed] 阶段 2：修复候选请求取消/版本校验、快照目标绑定和历史恢复边界
- [completed] 阶段 3：运营/最高管理独立个人聊天空间与按账号隔离
- [completed] 阶段 4：超级管理员审批、全量操作查看、工具使用/API/运行状态管理
- [completed] 阶段 5：运营主播复盘建议、主播审批与使用率/回复率统计
- [completed] 阶段 6：聊天头像旁维护任务、采用/不采用任务建议并参与 AI 生成
- [completed] 阶段 7：全量测试、生产构建和 3102 浏览器复审

## 当前阶段：审批隔离、只读查看与临时游客工作台（2026-10-05）

目标：先消除 Service Worker/API 缓存导致的账号串线和审批待办消失，再让运营与超级管理员安全查看所属主播工作台，补充维护任务录入和隔离的手机号游客临时工作台。

- [completed] Task 1：API 私有响应与 Service Worker 缓存绕过
- [completed] Task 2：审批中心队列独立加载、运营审批刷新和 base path 回归
- [completed] Task 3：只读主播工作台认证与快照请求顺序修复
- [completed] Task 4：维护任务手动创建与权限边界
- [completed] Task 5：手机号游客会话、24 小时空闲清理与临时数据隔离
- [completed] Task 6：游客登录入口、临时聊天工作台和完整 AI 候选链路
- [completed] Task 7：全量回归、隔离生产构建和 3102 浏览器复审（浏览器交互仍建议由用户按清单复测）

### Task 3-7 验证证据（2026-10-05）

- [completed] Task 3：只读主播工作台先校验当前 `/api/auth/me/`，再请求快照；服务端保持运营范围和超级管理员全量权限，401/403 不改成匿名访问。
- [completed] Task 4：维护任务支持主播、所属运营和超级管理员按范围手动创建；人工任务来源为空，支持 requestId 幂等与审计事务，聊天页可选择是否参与下一轮 AI。
- [completed] Task 5：游客独立 `guest_accounts`/`guest_sessions`、手机号 HMAC、`hh_guest_session`、24 小时滑动过期与懒清理；正式 `/me`、快照和聊天 API 不接受游客会话。
- [completed] Task 6：登录页增加手机号-only 游客入口；游客聊天使用 `guest:<id>` 本地命名空间，候选与回复历史仅本地保存；`/api/profile` 续期游客会话并拒绝正式对象、消息和维护任务 ID，仍通过 Runtime → GLM-5.3 生成候选。
- [completed] Task 7：`npm test` 全量通过，游客/认证/聊天/API 定向测试通过，`git diff --check` 通过；隔离临时副本生产构建通过。未覆盖真实外部智谱调用、Windows 部署和真实浏览器 Service Worker 运行时。

### Task 1-2 验证证据

- `test-service-worker.cjs`、`test-approval-isolation.cjs`、`test-auth-api.cjs`、`test-admin-ui.cjs`、`test-super-admin-approval-api.cjs`、`test-super-admin-approval-ui.cjs` 均通过。
- Service Worker 现在按注册 scope 计算 `/api` 前缀并绕过所有 API；认证与审批响应显式 `private, no-store`。
- 超级管理员两条审批队列独立加载；运营分支使用主播审批队列，审批后可见列表立即刷新。
- 规格审查和代码质量审查均通过；剩余限制是契约测试尚未替代真实浏览器/生产 Service Worker 运行时验证。

## 本阶段约束

- 不读取抖音后台，不新增自动发送；AI 仍只处理主播或有权账号主动输入的文本。
- 主播、运营、最高管理的数据按 `owner_user_id` 和本机 `storageScope` 双重隔离；运营/最高管理不自动获得主播私人工作区写权限。
- 不覆盖用户已有未提交改动；不直接操作正在运行服务使用的 `.next` 或真实数据库。

## 当前阶段：Windows 10 局域网部署准备（2026-10-05）

目标：把部署前配置校验、显式数据目录和可审计的启动/停止入口固化为跨平台可测试的源码契约，同时明确 Windows 实机、服务托管、防火墙和 HTTPS 仍需验收的边界。

- [completed] 阶段 1：部署配置校验与失败分类
- [completed] 阶段 2：Windows PowerShell/cmd 启停入口与安全参数传递
- [completed] 阶段 3：部署文档、测试结果与生产构建回归（源码/隔离副本）

本阶段不启动/重启当前 3102，不修改正式 `data/auth.sqlite`，不把 macOS 源码测试描述为 Windows 10 运行时验收。

### 本阶段验证证据

- `npm test`：94/94 通过。
- `node test-windows-deploy-config.cjs`：通过；合成生产变量执行 `npm run windows:check`：通过且不输出密钥。
- 独立临时副本 `npm run build`：通过；`git diff --check`：通过。
- Windows 10 实机、服务托管、防火墙、HTTPS、真实局域网访问、断电恢复和升级回滚仍为 PENDING。

## 当前阶段：Runtime 唯一入口（2026-10-05）

目标：让旧首页和 `/chat` 共用服务端 `goutoujunshi Runtime → GLM-5.3` 正式分析结果，消除浏览器端第二套关系判断路径。

- [completed] Task 1：新增旧入口唯一 Runtime 契约失败测试，确认旧路径当前会被捕获
- [completed] Task 2：移除旧首页浏览器端正式分析和 `relationshipState` 请求字段
- [completed] Task 3：服务端忽略遗留客户端关系状态并补充 API 契约
- [completed] Task 4：全量测试、独立生产构建和文档回归

### 本阶段验证证据（2026-10-05）

- `npm test`：95/95 通过；包含旧入口唯一 Runtime、页面生成契约和服务端伪造关系状态回归。
- `git diff --check`：通过。
- 独立临时副本 `npm run build`：通过；副本只补入 `data/scripts.json`，未复制正式 SQLite 数据库，也未停止或重启 3102。
- 当前结论仅覆盖源码、离线测试和独立构建；真实 GLM、浏览器交互和 Windows 10 局域网部署仍待验收。

## 当前阶段：Runtime UI 投影（2026-10-05）

目标：让旧首页只展示服务端 Runtime 结果，避免浏览器本地预判在生成前或失败后被误认为正式分析。

- [completed] Task 1：新增 Runtime UI 投影纯函数与失败测试
- [completed] Task 2：旧首页改为只写入服务端投影，生成前/失败时清除旧正式分析
- [completed] Task 3：全量测试、独立生产构建和文档回归

### 本阶段验证证据

- `npm test`：97/97 通过，包含 `test-runtime-ui-projection.cjs` 与 `test-runtime-ui-projection-contract.cjs`。
- `git diff --check`：通过。
- 独立临时副本 `npm run build`：通过；未停止或重启 3102，也未复制正式 SQLite 数据库。
- 真实智谱、浏览器端到端和 Windows 10 局域网实机仍待验收。

## 当前阶段：回复历史 Runtime 上下文持久化（2026-10-05）

- [completed] 写失败测试，固定 migration、API 往返和 UI 保存/恢复契约
- [completed] `reply_history` 增加 Runtime 五组 JSON 字段并接入 0003 迁移
- [completed] 登录/访客历史保存与恢复同时还原候选和 Runtime 上下文
- [completed] 全量测试、隔离构建与最终证据归档

## 当前阶段：Agent Browser 冒烟适配（2026-10-05）

- [completed] 写失败测试，固定浏览器开关、preflight、凭据边界和 session 生命周期
- [completed] 实现 `scripts/browser-regression/agent-browser-smoke.cjs` 与 `npm run browser:smoke`
- [completed] 全量测试、隔离构建与最终证据归档

## 当前阶段：浏览器回归安全前置（2026-10-05）

- [completed] 写失败测试，覆盖环境、端口、数据库、provider key 和 Cookie 边界
- [completed] 实现 `lib/browser-regression-preflight.cjs` 与 CLI
- [completed] 更新 `docs/production/BROWSER-REGRESSION.md` 和生产证据
- [completed] 全量测试、隔离构建与最终证据归档
