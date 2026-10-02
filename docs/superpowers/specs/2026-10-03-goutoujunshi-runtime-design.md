# Goutoujunshi 本地运行时级复刻设计

## 目标

在现有 Next.js 维护系统中实现一个可独立测试的 `goutoujunshi` 本地 Runtime，使其行为覆盖上游 Skill 的核心运行流程：情绪落地、首次建档与补问、证据拆分、按需知识路由、互惠/现实/风险/机会成本判断、明确主目标、行动收束、观察窗口、停止条件和经同意的长期记忆治理。GLM-5.3 只负责在 Runtime 状态和安全边界内生成自然语言表达。

本设计不实现抖音登录、私信抓取、平台后台读取或自动发送；主播仍需主动提供有权使用的文本或截图识别结果，并人工修改、选择和发送回复。

## 现状与缺口

上游 `vendor/goutoujunshi` 是面向 AI 宿主的 Skill，而不是可直接启动的 Node/Python Web 服务。它由以下运行资料组成：

- `SKILL.md`：行为内核、五步分析流程、首次建档、证据边界、安全边界和渐进式披露规则。
- `references/knowledge/`：关系科学、情绪、在线聊天、边界、法律安全等知识资料。
- `references/practical/`：话术编排、聊天分析、主动表达、投入失衡、长期记忆等实用资料。
- `scripts/validate_skill.py`：结构、路径、预算和行为回归验证。
- `scripts/memory_store.py`：同意门禁、记忆上下文、限量、暂停、恢复、撤销、忘记对象和清空。

当前项目的 `lib/goutoujunshi-core.js` 已能产生确定性关系状态，`pages/api/profile.js` 已能选择少量参考资料并调用 GLM-5.3，但仍缺少可独立调用的完整 Runtime 边界、首次建档/补问、记忆治理、上游路由完整映射和统一输出契约。

## 架构

新增 `lib/goutoujunshi-runtime/`，由 API 路由调用，内部模块保持单一职责：

```text
主播授权素材
  -> input（清洗、来源、说话人映射）
  -> intake（首次建档/缺失字段/必要问题）
  -> evidence（事实、推测、未知、矛盾、置信度）
  -> knowledge（上游 1–3 份资料和加载原因）
  -> decision（情绪、互惠、现实、风险、机会成本、主目标）
  -> action（建议、观察窗口、停止条件、分支）
  -> memory（按主播和对象隔离的同意式记忆）
  -> prompt context
  -> GLM-5.3 原创表达
  -> generation validation
```

### Runtime 输入

```js
{
  actor: { userId, role },
  subject: { brotherId, alias },
  currentMessage,
  history: [{ sender, message, occurredAt, source }],
  sources: { works, comments, statements, transcript, ocrMessages },
  speakerMapping,
  profile: { user, subject, relationship },
  memory: { consent, command },
  replyPreferences,
  replyStyle
}
```

所有文本在 Runtime 入口统一清洗和限长。`actor.userId + subject.brotherId` 是唯一记忆命名空间；姓名或昵称只作为显示字段，不能成为隔离键。

### Runtime 输出

```js
{
  runtime: {
    name: "goutoujunshi",
    version: "1.0",
    sourceRevision,
    stages,
    loadedReferences: [{ path, reason, sha256 }]
  },
  intake: {
    needsProfile,
    missingFields,
    questions,
    confirmedProfile
  },
  analysis: {
    emotionLanding,
    facts,
    inferences,
    unknowns,
    contradictions,
    evidence,
    familiarity,
    reciprocity,
    opportunityCost,
    risk,
    primaryGoal,
    decision,
    observationWindow,
    stopCondition
  },
  memory: {
    status,
    namespace,
    changes,
    reversible
  },
  promptContext
}
```

`pages/api/profile.js` 继续返回现有 `profile`、`replies`、`algorithmCore`、`coreDecision` 字段，以兼容聊天页；同时返回 `runtime`、`intake`、`analysis` 和脱敏的 `memory` 信息。

## 五步分析流程

1. **情绪落地**：用事实支持的 2–4 句概括感受、触发点和冲突；高强度情绪先缩小到当前小时和发送前动作。
2. **事实拆分**：分别输出可确认事实、合理推测、关键未知和矛盾；原文、说话人、顺序、时间间隔和来源可作为事实，内心动机不能直接写成事实。
3. **利益判断**：评估互惠、可靠、吸引、价值观、现实可行性、可逆性、安全和机会成本；多个对象各自独立分析后才允许比较。
4. **明确建议**：确定本轮唯一主目标（承接、降压、调侃、轻推、约见、澄清、修复或收线）和理由；不把沉默视为同意。
5. **行动收束**：给一个现在能做的小动作、观察窗口、停止条件和积极/含糊/拒绝分支；每条消息只承载一个主要动作。

首次使用或档案缺失时，Runtime 返回紧凑补问，而不是强制要求所有字段。高风险消息或必须马上回复的消息先完成安全响应，再补充档案。

## 上游知识路由

Runtime 建立机器可读路由表，覆盖上游 `SKILL.md` 的场景入口。每次默认加载 1–3 个文件，至少包含证据边界和实战话术编排器，再按场景补充一份知识或实用指南。加载器必须：

- 只接受仓库内 allowlist 路径。
- 返回相对路径、加载原因、固定 revision 和内容 SHA-256。
- 对话术库只读取分析和分支编排部分，不把固定句库直接复制为候选回复。
- 参考资料作为上下文证据，不作为实时法律、医疗或心理诊断依据。

## 长期记忆

Runtime 通过当前主播账号隔离的存储适配器复刻 `memory_store.py` 的行为：

- 首次明确同意后才允许写入；拒绝、未选择或暂停时只在当前请求内使用。
- 主播稳定档案只接受本人明确陈述；对象事实和关系事件需要主播明确确认；模型推断只能进入带置信度的假设或事件。
- 原始聊天全文、未授权平台数据、凭据和敏感属性推断不写入长期记忆。
- 支持状态、启用、暂停、恢复、查看、撤销、忘记对象、清空全部和撤销最近一次变更。
- 保留总条数、分类条数和操作历史上限；达到上限时合并或删除低价值事件，不无限扩容。
- 每次写入返回摘要、来源、置信度和撤销方式；失败时明确未持久化。

## 安全策略

- 不生成诱导刷礼、转账、借钱、消费回报、虚假亲密或利用脆弱性的内容。
- 可以生成自然的感谢、直播内容提醒和可拒绝的观看邀请，但不把观看、礼物或消费写成义务、回报或关系证明。
- 不根据姓名、MBTI、性别或单条消息推断人格、性取向、健康、宗教、政治、财务能力、精确位置等敏感属性。
- 主播明确提供并确认的称呼、兴趣和沟通偏好可以作为带来源的事实；不据此推导更多隐含属性。
- 出现威胁、自伤、性胁迫、隐私索取、跟踪、诈骗或财务控制时，先保护主播和转介现实支持，不继续普通暧昧话术。
- 明确拒绝、要求停止联系或持续越界时，只给收线、边界和安全建议。

## API 与界面

`POST /api/profile` 保持现有请求入口，内部顺序调整为：鉴权 → 输入清洗 → `Runtime.analyze()` → `Runtime.buildPromptContext()` → GLM-5.3 → `Runtime.validateGeneration()`。客户端提交的 `relationshipState` 只作为展示上下文，不能覆盖服务端计算的 `risk`、`primaryGoal`、`unknowns` 或记忆权限。

聊天页新增可折叠“分析依据”区域，展示当前目标、事实/推测/未知、风险提示、引用资料、观察窗口、停止条件和记忆状态。普通主播只能查看自己的命名空间；运营和最高管理只能按既有只读权限查看授权范围，不可修改主播记忆或代发消息。

## 测试与验收

### 单元和契约测试

- Runtime 基本流程覆盖五个阶段和固定输出版本。
- 来源边界覆盖截图、粘贴、转述、OCR 和未知说话人；映射不明不得自动归属。
- 知识路由每次最多 3 个文件，且路径、哈希和加载原因可追踪。
- 记忆覆盖同意、拒绝、暂停、恢复、撤销、忘记对象、清空和上限。
- 安全测试拒绝刷礼诱导、敏感属性推断、虚假亲密和越界推进。
- API 测试确保 GLM-5.3 不能改写 Runtime 的目标、风险和未知项。
- 账号隔离测试确保同名维护对象在不同主播账号下数据完全分离。

### 回归和构建

```text
python3 vendor/goutoujunshi/scripts/validate_skill.py
python3 vendor/goutoujunshi/scripts/validate_skill.py --runtime
npm test
npm run build（隔离目录）
git diff --check
```

真实智谱 API 调用只在用户已配置 Key、网络和权限的环境中单独验证；测试通过不等于外部供应商权限已验证。

## 明确不在本阶段范围

- 抖音账号登录、私信/评论自动抓取、绕过平台接口或自动发送。
- 将上游 Skill 改造成对外公开服务或跨主播共享记忆。
- 训练新的语言模型、复制上游版权资料到提示词之外或把参考文档当成事实数据库。
- 允许诱导礼物、转账、消费或根据敏感属性进行画像推断。
