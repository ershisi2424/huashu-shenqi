const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createAuthStore } = require("./lib/auth-store.cjs");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-maintenance-task-create-"));
const store = createAuthStore({ filename: path.join(root, "auth.sqlite") });
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
const operator = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password" });
store.approveOperator({ operatorId: operator.id, approvedBy: admin.id });
const anchor = store.createAnchor({ operatorId: operator.id, phone: "13700137000", name: "主播一号", password: "anchor-password" });
const otherOperator = store.registerOperator({ phone: "13600136000", name: "运营二号", password: "operator-password-2" });
store.approveOperator({ operatorId: otherOperator.id, approvedBy: admin.id });
const otherAnchor = store.createAnchor({ operatorId: otherOperator.id, phone: "13500135000", name: "主播二号", password: "anchor-password-2" });
const brother = store.createChatBrother({ actor: anchor, clientId: "manual_task_brother", nickname: "山哥" });
const otherBrother = store.createChatBrother({ actor: otherAnchor, clientId: "manual_task_other", nickname: "海哥" });

const createdByAnchor = store.createMaintenanceTask({ actor: anchor, brotherId: brother.id, title: "今晚跟进工作状态", reason: "大哥提到最近忙", nextAction: "晚间再自然问候", priority: "high" });
assert.equal(createdByAnchor.status, "follow_up");
assert.equal(createdByAnchor.type, "follow_up");
assert.equal(createdByAnchor.ownerUserId, anchor.id);
assert.equal(createdByAnchor.operatorId, operator.id);
assert.equal(createdByAnchor.sourceMessageId, null);
assert.equal(createdByAnchor.title, "今晚跟进工作状态");

const retry = store.createMaintenanceTask({ actor: anchor, brotherId: brother.id, title: "重复提交不应重复建任务", requestId: "anchor-retry-1" });
const retryAgain = store.createMaintenanceTask({ actor: anchor, brotherId: brother.id, title: "重复提交不应重复建任务", requestId: "anchor-retry-1" });
assert.equal(retryAgain.id, retry.id, "同一主播和 requestId 必须幂等返回原任务");
assert.equal(retryAgain.requestId, "anchor-retry-1");
const otherRetry = store.createMaintenanceTask({ actor: otherAnchor, brotherId: otherBrother.id, title: "其他账号可以使用相同 requestId", requestId: "anchor-retry-1" });
assert.notEqual(otherRetry.id, retry.id, "不同账号不能复用另一账号的任务");

const createdByOperator = store.createMaintenanceTask({ actor: operator, brotherId: brother.id, title: "运营建议跟进", dueAt: "2026-10-06T10:00:00.000Z" });
assert.equal(createdByOperator.status, "follow_up");
assert.equal(createdByOperator.sourceMessageId, null);

const createdByAdmin = store.createMaintenanceTask({ actor: admin, brotherId: brother.id, title: "管理员提醒" });
assert.equal(createdByAdmin.status, "follow_up");
assert.equal(createdByAdmin.sourceMessageId, null);

assert.throws(() => store.createMaintenanceTask({ actor: otherOperator, brotherId: brother.id, title: "越权任务" }), /CHAT_ACCESS_DENIED|TASK_ACCESS_DENIED/);
assert.throws(() => store.createMaintenanceTask({ actor: operator, brotherId: otherBrother.id, title: "越权任务" }), /CHAT_ACCESS_DENIED|TASK_ACCESS_DENIED/);
assert.throws(() => store.createMaintenanceTask({ actor: anchor, brotherId: "missing", title: "缺少对象" }), /CHAT_BROTHER_NOT_FOUND|CHAT_ACCESS_DENIED/);
assert.throws(() => store.createMaintenanceTask({ actor: anchor, brotherId: brother.id }), /TASK_TITLE_REQUIRED/);
assert.throws(() => store.createMaintenanceTask({ actor: anchor, brotherId: brother.id, title: "   " }), /TASK_TITLE_REQUIRED/);
assert.throws(() => store.createMaintenanceTask({ actor: anchor, brotherId: brother.id, title: "类型错误", type: "unknown" }), /TASK_TYPE_INVALID/);
assert.throws(() => store.createMaintenanceTask({ actor: anchor, brotherId: brother.id, title: "优先级错误", priority: "urgent" }), /TASK_PRIORITY_INVALID/);
assert.throws(() => store.createMaintenanceTask({ actor: anchor, brotherId: brother.id, title: "时间错误", dueAt: "not-a-date" }), /TASK_DUE_AT_INVALID/);
assert.throws(() => store.createMaintenanceTask({ actor: anchor, brotherId: brother.id, title: "x".repeat(121) }), /TASK_TITLE_TOO_LONG/);
assert.throws(() => store.createMaintenanceTask({ actor: anchor, brotherId: brother.id, title: "文本过长", reason: "x".repeat(1001) }), /TASK_TEXT_TOO_LONG/);

const auditRows = store.listAuditLogs({ actor: admin, action: "chat.task.create" }).items;
assert.ok(auditRows.length >= 3, "人工任务必须写入 chat.task.create 审计");
assert.ok(auditRows.some((row) => row.metadata?.type === "follow_up" && row.metadata?.sourceMessageId === null));
assert.equal(auditRows.filter((row) => row.metadata?.requestId === "anchor-retry-1" && row.actor?.id === anchor.id).length, 1, "幂等重试只能写一条审计");

const source = fs.readFileSync(path.join(__dirname, "lib/auth-store.cjs"), "utf8");
assert.match(source, /const create = db\.transaction\(\(\) => \{/);
assert.match(source, /audit\(\{ actorUserId: current\.id, action: "chat\.task\.create"/);

store.close();
fs.rmSync(root, { recursive: true, force: true });
console.log("test-maintenance-task-create: ok");
