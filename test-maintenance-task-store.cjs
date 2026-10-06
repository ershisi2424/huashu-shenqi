const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createAuthStore } = require("./lib/auth-store.cjs");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-maintenance-tasks-"));
const store = createAuthStore({ filename: path.join(root, "auth.sqlite") });
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
const operator = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password" });
store.approveOperator({ operatorId: operator.id, approvedBy: admin.id });
const anchor = store.createAnchor({ operatorId: operator.id, phone: "13700137000", name: "主播一号", password: "anchor-password" });
const otherOperator = store.registerOperator({ phone: "13600136000", name: "运营二号", password: "operator-password-2" });
store.approveOperator({ operatorId: otherOperator.id, approvedBy: admin.id });
const otherAnchor = store.createAnchor({ operatorId: otherOperator.id, phone: "13500135000", name: "主播二号", password: "anchor-password-2" });

const brother = store.createChatBrother({ actor: anchor, clientId: "bro_task_1", nickname: "山哥" });
const otherBrother = store.createChatBrother({ actor: otherAnchor, clientId: "bro_task_2", nickname: "海哥" });
const incoming = store.appendChatMessage({ actor: anchor, brotherId: brother.id, message: { id: "msg_task_1", sender: "brother", source: "paste", status: "confirmed", text: "晚上好，今天有点累" } });
assert.equal(incoming.sender, "brother");

const anchorTasks = store.listMaintenanceTasks({ actor: anchor, brotherId: brother.id });
assert.equal(anchorTasks.items.length, 1);
assert.equal(anchorTasks.items[0].status, "pending_reply");
assert.equal(anchorTasks.items[0].sourceMessageId, incoming.id);
assert.equal(anchorTasks.summary.pendingReply, 1);

const operatorTasks = store.listMaintenanceTasks({ actor: operator });
assert.equal(operatorTasks.items.length, 1);
assert.equal(operatorTasks.items[0].brotherId, brother.id);
const adminTasks = store.listMaintenanceTasks({ actor: admin });
assert.equal(adminTasks.items.length, 1);
assert.equal(store.listMaintenanceTasks({ actor: otherOperator }).items.length, 0, "其他运营看不到不属于自己的任务");
assert.throws(() => store.updateMaintenanceTask({ actor: operator, taskId: anchorTasks.items[0].id, status: "done" }), /TASK_WRITE_DENIED/);

const snoozed = store.updateMaintenanceTask({ actor: anchor, taskId: anchorTasks.items[0].id, status: "snoozed", nextAction: "晚点再关心他的状态" });
assert.equal(snoozed.status, "snoozed");
assert.equal(snoozed.nextAction, "晚点再关心他的状态");
const reopened = store.updateMaintenanceTask({ actor: anchor, taskId: snoozed.id, status: "pending_reply" });
assert.equal(reopened.status, "pending_reply");

const sent = store.appendChatMessage({ actor: anchor, brotherId: brother.id, message: { id: "msg_task_2", sender: "anchor", source: "manual", status: "sent", text: "哥辛苦了，早点休息" } });
assert.equal(sent.status, "sent");
assert.equal(store.listMaintenanceTasks({ actor: anchor, brotherId: brother.id }).items[0].status, "done");
assert.equal(store.listMaintenanceTasks({ actor: otherOperator }).items.length, 0, "其他运营看不到不属于自己的任务");
assert.equal(store.listMaintenanceTasks({ actor: admin, brotherId: otherBrother.id }).items.length, 0);

store.close();
fs.rmSync(root, { recursive: true, force: true });
console.log("test-maintenance-task-store: ok");
