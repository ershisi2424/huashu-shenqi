# 当前项目接入说明

此目录是 `shengjidaguai-china/goutoujunshi` 的锁定源码快照，供当前项目的 `lib/goutoujunshi-core.js` 做算法适配和来源追踪。上游仓库本身是面向 AI 宿主的 Skill，不是可直接安装的 Node 服务；因此当前项目没有把 Markdown 知识库全部塞给 GLM-5.3，而是把上游要求编译成可测试的结构化状态：

1. 情绪落地；
2. 事实、推测和未知拆分；
3. 互惠、现实可行性、风险和机会成本判断；
4. 本轮唯一主目标与动作；
5. 观察窗口和停止条件。

`lib/goutoujunshi-core.js` 固定记录上游仓库 URL 和 revision。它按当前消息和风险选择 1–3 个上游参考文档路径；`pages/api/profile.js` 会校验核心算法身份并把 `algorithmCore`、`decision`、证据和边界交给 GLM-5.3。模型输出的只是原创表达、画像摘要和多元回复，不得替换或绕过核心算法。

上游许可文件保留在本目录的 `LICENSE` 和 `LICENSE.zh-CN.md`。
