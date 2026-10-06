# Runtime 结果投影设计

## 目标

让旧首页 `/` 的分析卡片只展示服务端 `goutoujunshi Runtime → GLM-5.3` 返回的结构化结果，避免浏览器本地启发式分析在生成前或生成失败后被误认为正式判断。

## 当前问题

`pages/index.js` 为了提供轻量输入提示调用 `analyzeBrotherQuote`，随后把 `localAnalysis` 直接写入 `analysis` 状态。即使 `/api/profile` 尚未返回或请求失败，页面仍可能显示旧的场景、风险、画像和回复提示；这些字段不是服务端 Runtime 的权威结果。

## 方案

1. 保留 `analyzeBrotherQuote` 作为候选卡片内部的非权威 UI 辅助，不再把它写入正式 `analysis` 状态。
2. 新增纯函数 `projectRuntimeAnalysis(payload)`，只从 API 返回的 `analysis`/`relationshipState` 生成旧首页所需的展示字段。
3. 生成开始时清空旧正式分析；请求成功后只写入 Runtime 投影；请求失败时清空正式分析和旧 Runtime 投影。
4. 投影保留事实、未知、主目标、情绪、风险、熟悉度、行动、观察窗口、停止条件和核心算法标识，不改变服务端分析和 AI 请求协议。

## 数据边界

- 浏览器本地分析不得作为事实、画像、关系状态或服务端请求字段。
- 服务端 `payload.analysis` 优先；兼容旧响应时才读取 `payload.relationshipState`。
- 投影仅供 UI 展示，不回写服务端，不覆盖候选生成上下文。

## 验收标准

1. 纯函数测试覆盖服务端 Runtime 结果到 UI 字段的映射、空结果和高风险状态。
2. 页面契约证明不再执行 `setAnalysis(localAnalysis)`，并在成功/失败路径使用投影与清理。
3. 现有 API、聊天、候选保存、账号隔离和 95 项全量测试继续通过。
4. 独立生产构建通过；真实智谱、浏览器端到端和 Windows 10 运行时仍单独标记未验收。
