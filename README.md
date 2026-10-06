# 大哥维护话术神器

Next.js 私聊回复工具：以 vendored `goutoujunshi` 核心算法先判断事实、风险、互惠和本轮目标，再交给智谱 GLM-5.3 直接原创生成 6–8 条多元回复。AI 根据该核心算法输出的证据和关系边界自由组织口语，不依赖本地固定话术，不进行唯一答案排序或淘汰。AI 失败时不会展示未经 AI 生成的本地候选。

生成前会由 `goutoujunshi` 核心适配层按“情绪落地 → 事实拆分 → 利益判断 → 明确建议 → 行动收束”处理输入，拆成可确认事实、保守推测和关键未知，并识别情绪、风险、熟悉度、互惠信号与本轮唯一主目标。智谱模型只能在这份核心状态和按需参考资料边界内直接原创回复，不得把未知补成事实或在一条回复里同时执行多个关系动作。

## 本地运行

```bash
npm install
cp .env.example .env.local
# 编辑 .env.local，填入 ZAI_API_KEY
npm run dev
```

打开 `http://localhost:3000`。

手机聊天工作台：打开 `http://localhost:3000/chat`。主播可以新增维护对象，手动输入、粘贴或导入截图识别大哥消息。截图 OCR 结果会先进入可编辑的待确认区，主播逐条确认后才写入左侧历史。确认消息后，可以调用 GLM-5.3 / `goutoujunshi` 链路生成多元回复，或按早安、下班、接着上次话题、轻松聊天生成画像驱动的日常开场；候选会放入可编辑的主播回复输入框。复制回复后需要主播在抖音实际发送，再回工具点击“标记已发送”，工具不会读取或调用抖音私信发送接口。

第三阶段已接入 SQLite 账号、服务端聊天同步和运营只读复盘：登录后的主播会把已确认的左右消息增量同步到服务端，运营只能查看自己所属主播的账号统计和最近消息，最高权限账号可以查看全量。聊天仍不连接抖音代发；Windows 多设备打包、历史本地数据显式迁移和全量审计页继续按 `../docs/superpowers/plans/2026-09-30-mobile-wechat-chat-roadmap.md` 完善。真实 OCR 语言包下载和真实智谱 Key 联调需在目标环境单独验证。

超级管理员登录后可在 `/admin/settings/` 的“服务配置”中填写智谱 API Key、模型和接口地址，并使用“测试调用”确认真实权限。设置接口只允许 `super_admin`，响应不会返回 Key；主播和运营页面只显示脱敏的服务状态。旧 `/api/settings` 仅作为受保护兼容入口，新的配置流程应使用后台服务配置页。

## 环境变量

- `ZAI_API_KEY`：智谱 API Key，仅在服务端使用，不要添加 `NEXT_PUBLIC_` 前缀。
- `ZHIPU_MODEL`：可选，默认 `glm-5.3`。
- `ZHIPU_BASE_URL`：可选，默认 `https://open.bigmodel.cn/api/paas/v4`。
- `PROFILE_RATE_LIMIT_MAX`：可选，本地 `/api/profile` 在时间窗口内允许的最大请求数，默认 `60`。
- `PROFILE_RATE_LIMIT_WINDOW_MS`：可选，本地限流窗口毫秒数，默认 `600000`（10 分钟）。
- `NEXT_PUBLIC_BASE_PATH`：可选的子路径。

## 部署

AI 功能依赖 `pages/api/profile.js` 服务端路由，因此不能再部署到只支持静态文件的 GitHub Pages。请使用 Vercel、Node.js 服务器或其他支持 Next.js API Routes 的平台，并在平台中配置上述服务端环境变量。

Windows 10 局域网试用请参考 [生产部署清单](./docs/production/WINDOWS-LAN.md)。仓库提供启动前配置校验和显式参数的 PowerShell/cmd 入口：应用目录、数据目录、监听地址和端口都必须由部署者确认；生产认证默认开启，数据库放在应用目录之外。脚本只做配置检查和前台托管，不替代 Windows 防火墙、HTTPS、服务账户权限和备份恢复验收。

### Windows 联网引导安装包

联网安装器的构建和放行门禁见 [Windows 发布清单](./docs/production/WINDOWS-RELEASE-CHECKLIST.md)。在 Windows 构建机上先准备 HTTPS 制品地址和锁定的 `release-manifest.json`，再执行：

```powershell
node scripts/windows/installer/compile-installer.cjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/package-release.ps1 `
  -ReleaseDir .\release `
  -ExePath .\Huashu-Setup-x64.exe `
  -OutputDir .\dist\windows `
  -ArtifactBaseUrl https://example.invalid/huashu `
  -ManifestPath .\release-manifest.json
```

`package-release.ps1` 会先校验 SHA-256、win32/x64 声明、`better-sqlite3` 原生模块和 Authenticode 状态；未签名内部包只能标为 `INTERNAL_UNVERIFIED`。不要将 API Key、密码、SQLite 或聊天数据放入发布目录。生产部署、升级、修复和卸载保留数据的逐项验收以清单为准；没有 Windows 原生烟测和干净机 HTTP 烟测时，不得宣称安装包已完成商用验收。

## 数据与合规边界

- 应用不自动爬取抖音数据；用户必须手动提供有权使用的文本。
- 每次生成都必须先确认授权，当前消息、关系状态和用户填写的可选素材会发送给智谱进行画像分析与原创回复生成。
- 抖音素材仅用于授权的 AI 请求；启用本地记忆后，历史记录会在本机保存本轮素材以支持“AI 重新生成”，不会上传到其他服务或写入服务端数据库。
- 画像不允许推断敏感属性、经济能力或脆弱性。
- 话术不应诱导刷礼、借钱、转账、虚假亲密或排他性依赖。

## 维护原则

- 回复强调真诚、有分寸、具体关心和自然连续性，主播同时保留自己的生活与边界。
- 根据已有素材和真实聊天记录调整表达；证据不足时不擅自给对方分类或推断心理。
- 事业和理性表达更适合平等、简洁的朋友式交流；情感表达可以多倾听，但不制造唯一感或秘密同盟。
- 礼物和金钱场景平静感谢、量力而行，不把消费与亲密承诺绑定。
- 不采用故意慢回、假装忙碌、欲擒故纵、考验、刺激征服欲或培养情感依赖等操控方法。

## goutoujunshi 核心算法接入

上游仓库已按锁定 revision 放入 `vendor/goutoujunshi/`，来源为 [shengjidaguai-china/goutoujunshi](https://github.com/shengjidaguai-china/goutoujunshi)，当前 revision 为 `6db7354a4002dc7c448a9c87ffdad8132570c9d3`。运行时不会把整个知识库拼进 Prompt，而是由 [goutoujunshi-core.js](./lib/goutoujunshi-core.js) 执行核心工作流、生成结构化决策，并按场景选择上游参考文档路径。

每次 `/api/profile` 请求都会携带并返回 `algorithmCore`、上游 revision、选中的参考资料和 `coreDecision`。GLM-5.3 只能在这些算法结果、事实证据、未知项和风险边界内生成话术；它负责语言表达，不负责绕过核心算法重新判断关系目标。

## 关系状态适配层

`lib/goutoujunshi-core.js` 是纯本地、可测试的 `goutoujunshi` 核心算法适配层；`lib/relationship-engine.js` 保留为旧接口兼容。核心输出：

- `facts`：当前消息和授权素材中的可确认事实；
- `inferences`：有证据但仍需保守表达的暂定解释；
- `unknowns`：不能从现有信息确定的关键问题；
- `emotion`、`risk`、`familiarity`、`reciprocity`；
- `primaryGoal`：承接、降压、调侃、轻推、澄清或收线中的一个。

高风险和高强度负面情绪优先于升温、调侃和邀约。当前消息与结构化关系状态会发送给智谱，但未经授权的原始素材不会被自动采集。

## 验证

```bash
npm test
npm run build
```

### GLM-5.3 与 OCR 本机联调

项目提供只使用虚构内容的本地联调命令：

```bash
npm run smoke:ai-ocr
# 或指定本机端口
npm run smoke:ai-ocr -- --base-url http://127.0.0.1:3102
```

脚本依次检查 `/api/health`、真实 `/api/profile` 和真实 `/api/ocr`，验证 GLM-5.3、`goutoujunshi` 核心算法、4 条多元回复和 OCR 人工确认门禁。它只读取项目内的合成聊天图片和固定合成文本，不读取数据库、抖音账号或本地聊天文件；输出不会包含 API Key、Cookie、原始请求或原始响应。

若 Windows 局域网服务开启了 `AUTH_REQUIRED=true`，可在本机已有登录会话下临时传入 `SMOKE_SESSION_COOKIE` 环境变量；不要把 Cookie 写入命令行历史或提交到文件：

```bash
SMOKE_SESSION_COOKIE="仅当前本机临时会话" npm run smoke:ai-ocr
```

没有配置 `ZAI_API_KEY`、智谱账号无权限/限流、Tesseract 中文语言包尚未下载，或本机服务未启动时，脚本会返回非零退出码和脱敏错误码。这些情况不能被报告为真实 AI/OCR 已通过；离线 `npm test` 仍可在没有 Key 或网络时运行。

`public/1v1.html` 仅保留为兼容入口，会跳转到使用智谱 AI 的主应用。

## 回复后续分支（P1）

每条 GLM-5.3 原创结果还会返回 `sendWhen`、三种 `branches`、`observationWindow` 和 `stopCondition`。这些内容只供主播人工判断：对方接住时向前一步、回复含糊时不连续追问、明确拒绝时尊重收线，并在发送后观察明确的互惠信号。界面默认折叠后续提示，直接复制区仍只放可发送的 `text`，系统不会自动发送。

## 截图 OCR 与画像开场（P2）

`/api/ocr` 只接受 PNG、JPG、WebP，单张不超过 8MB。识别结果带 `requiresConfirmation=true`，不会保存原图；页面先展示可编辑的识别 blocks，主播逐条选择“大哥（左侧）/主播（右侧）”并确认后才形成 `screenshot_ocr` 消息。识别器不擅自猜聊天方向，右侧确认记录也不会被当成抖音已发送。

画像开场通过 `/api/profile` 的 `generationMode=opening` 进入同一套 `goutoujunshi` 判断和 GLM-5.3 原创链路。`openingTopics` 只从已确认事实和兴趣证据生成；`liveInvite` 只有在明确有直播相关兴趣且 24 小时内未出现邀请时才保留，并由服务端过滤礼物、打赏、消费、转账等诱导表达。它只是一个可人工选择、可拒绝的内容候选，不是自动发送指令。

## SQLite 账号与角色（P3）

第三阶段新增 `/login`、`/api/auth/register`、`/api/auth/login`、`/api/auth/logout`、`/api/auth/me` 和超级管理员审批接口。运营注册后默认是 `pending`，必须由最高权限账号批准；主播可以在注册页选择已开通运营并提交申请，主播账号默认 `pending`，只能由所选运营批准后登录；运营仍可在后台直接创建主播账号。一个运营可以管理多个主播。密码使用 scrypt 哈希，登录会话只通过 HTTP-only Cookie 保存，接口不会返回密码或会话原文。

开发预览未显式配置时保持 `AUTH_REQUIRED=false`，这样可以继续检查聊天页面；生产构建未显式配置时默认要求登录。Windows 10 局域网试用仍建议在 `.env.local` 明确设置 `AUTH_REQUIRED=true` 和 `AUTH_DB_PATH=./data/auth.sqlite`。此时未登录用户会被引导到 `/login`，AI 接口也会拒绝未登录请求。SQLite 驱动使用 `better-sqlite3`，目标运行时建议 Node 22+，真实 Windows 打包仍待专项验收。

首次创建最高权限账号时，在服务端运行 `BOOTSTRAP_ADMIN_PHONE=... BOOTSTRAP_ADMIN_PASSWORD=... BOOTSTRAP_ADMIN_NAME=... npm run bootstrap-admin`。密码只用于生成 scrypt 哈希，不会写入日志或接口响应；不要把这条命令写进公开脚本或提交到 Git。

## 服务端聊天与运营复盘（P3 第二批）

`/api/chat/brothers` 保存维护对象的归属，`/api/chat/messages` 保存主播逐条确认的聊天消息；消息按主播账号归属，运营只能读取自己的主播，最高权限账号可以读取全部摘要。浏览器仍可使用本地记忆，登录后以本地消息 ID 作为幂等键增量同步，不会把截图原图上传或保存。

`/api/auth/anchors` 允许运营创建多个主播账号；`/api/ops/overview` 提供运营只读复盘数据。打开 `/admin` 后，超级管理员可以审批运营、查看全量运营/主播/最近消息，运营账号可以查看自己的主播统计并创建主播登录。看板不提供聊天编辑、AI 代发或抖音发送按钮。

### 主播自助申请（P3 第三批）

登录页的“主播注册”会从 `/api/auth/operators` 读取已批准运营，只显示运营姓名和脱敏手机号。主播提交手机号、姓名、密码和所属运营后，账号进入待审批状态；对应运营在 `/admin` 的“待审批主播”中批准或拒绝。待审批主播不能登录，批准后才可以进入聊天工作台；不匹配的运营无法审批其他运营名下的申请。

## 本地记忆门禁（P2 起步）

高级设置中默认关闭本地记忆。未启用时不读取或写入历史、收藏、大哥档案和偏好；启用后仅保存在本机浏览器。用户可以随时暂停并清空这些本地数据，清空后不会继续保留档案。该开关不改变本次智谱请求的素材授权流程。

历史记录支持单条删除；大哥档案会显示记忆来源和画像信心。暂停后再次启用即可恢复本机记忆功能，但已经清空的数据不会恢复。

已启用记忆时可以主动导出 JSON 备份。导出由浏览器直接完成，不经过智谱接口。

同一面板支持导入此前导出的 JSON 备份。导入前会检查文件大小和结构，只保留受支持的历史、收藏、档案与偏好字段；格式错误不会覆盖当前数据。

历史、收藏、档案、偏好和导入写入都会检查浏览器存储结果；遇到配额不足或隐私模式限制时，界面会提示本机数据未保存。

本地记忆使用一个版本化快照保存，旧版分散的 `hh_history`、`hh_fav`、`hh_brothers`、`hh_prefs` 会按需读取并在下一次成功写入时迁移。导入备份只写入一个快照键，写入失败时不会出现半套新数据覆盖旧数据。

## 按需知识路由（P3）

API 会根据当前消息和关系状态路由少量主题摘要：礼物与金钱、负面情绪、邀约、冲突、隐私与越界。普通问候只使用通用原则；命中主题时才把对应摘要放入智谱提示词，并在请求材料中记录 `knowledgeTopics`，方便检查本轮使用了哪些边界规则。

AI 画像卡片会显示本轮命中的边界主题，测试覆盖五类主题，便于检查路由是否与当前发言一致。

主题路由位于 `lib/knowledge-router.js`，可以脱离智谱单独测试。没有 API Key 时仍可验证主题命中、去重和最多三个主题的限制，但不会生成或展示未经 AI 生成的最终回复。

生成前会显示本轮请求规模估算：原创回复数量、画像素材字符数和近似输入 Tokens。估算基于本地 JSON 长度，只用于控制请求规模和排查成本，不代表智谱最终计费。

## 智谱配置检查

启动 Next.js 后访问 `GET /api/health` 可查看服务端是否读取到 Key、当前模型和端点。接口只返回配置状态，不返回密钥；`configured` 仅表示配置已读取，实际权限仍需通过一次 `/api/profile` 请求验证。

主界面顶部状态栏也会显示该配置状态，鼠标悬停可查看端点地址。

普通聊天页的智谱区域现在只显示脱敏状态和“重新检查”按钮，不提供 API Key 输入框。超级管理员应进入 `/admin/settings/`，通过受保护的“服务配置”页面填写 API Key、模型和端点，再点击“测试调用”确认实际权限。`/api/admin/settings` 和 `/api/admin/settings/test` 均要求 `super_admin`，保存结果不会返回 Key；旧 `/api/settings` 仅保留为同样受保护的兼容入口。

实际生成失败时，界面会区分 Key 无效（401）、权限不足（403）、本地限流、智谱速率限制（1302/1305）和账户欠费（1113），便于直接处理对应问题。
