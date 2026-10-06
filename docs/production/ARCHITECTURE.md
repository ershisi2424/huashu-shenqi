# 系统架构（当前实现）

## 技术框架

- Next.js 16.3.3 Pages Router：页面、服务端 API 和生产构建。
- React 19.2.8：聊天、登录、审批、用户管理、使用统计和任务工作台。
- Node.js 22 LTS：由 `.nvmrc`、`package.json.engines` 和 CI 统一约束。
- SQLite + `better-sqlite3` 13.0.3：本地局域网试用的数据存储；当前为单库、按资源归属做行级隔离。
- 智谱 GLM-5.3：仅通过服务端 provider 适配器调用；API Key 不进入浏览器响应。
- `goutoujunshi`：通过 `vendor/` 快照和 `lib/goutoujunshi-runtime/` 结构化适配层参与目标判断、证据整理和回复生成上下文。

## 模块边界

```text
pages/                         路由组合层
  api/auth                     登录、注册、审批、游客会话
  api/chat                     维护对象、消息、候选、历史、任务、审计数据
  api/admin                    设置、用户和使用统计
  api/profile                  生成编排：权限 -> 当前消息 -> Runtime -> GLM
components/                    页面交互层
  auth                         登录与注册
  chat                         主播工作台与管理只读工作台
  admin                        审批、审计、用户、服务和使用统计
  tasks                        维护任务
lib/                           领域与基础设施层
  auth-session.cjs             会话解析、权限入口、私有缓存头
  auth-store.cjs               SQLite repository/领域服务
  goutoujunshi-runtime/        结构化分析适配
  ai-provider.cjs              智谱 provider、错误映射、脱敏
  chat-*.cjs                   聊天状态、目标、滚动、会话和本机草稿
  maintenance-task.cjs         任务状态与转换
scripts/verification/           测试发现、隔离 runner、验证入口
vendor/                         上游参考快照与版本锁定
```

## 关键调用链

1. 登录 API 根据手机号和密码验证服务端 SQLite 中的活动账号，签发 HttpOnly 会话 Cookie。
2. 聊天 API 通过服务端会话得到 actor，再按角色和 `owner_user_id/operator_id` 校验维护对象范围。
3. 生成请求必须携带当前已确认大哥消息的 `sourceMessageId`；服务端从数据库重建正文和历史，不信任浏览器正文。
4. Runtime 先产出结构化目标/证据/边界，再由 GLM-5.3 输出候选；前端只展示候选，主播修改并自行发送。
5. 候选快照和回复历史绑定对象、来源消息和生成批次；对象切换或旧请求返回时丢弃旧结果。
6. 运营/超级管理员的只读查看通过独立权限 API 和审计入口，不复用主播的个人本地工作区。

## 设计取舍

当前采用模块化单体而非微服务：适合 Windows 10 局域网单机部署，降低运维复杂度。模块之间通过 API/领域函数隔离，后续可将 provider、审计、任务或数据库 repository 独立部署，不需要重写前端协议。

物理分库尚未实现；当前使用单 SQLite 的逻辑行级隔离。若团队规模或合规要求需要主播物理分库，必须在迁移与备份方案确认后单独实施。
