const assert = require("node:assert/strict");

const task = require("./lib/maintenance-task.cjs");

const created = task.createTask({
  id: "task_1",
  brotherId: "brother_1",
  ownerUserId: "anchor_1",
  operatorId: "operator_1",
  type: "reply",
  status: "pending_reply",
  title: "回复大哥消息",
  reason: "收到新的大哥消息",
  nextAction: "先确认对方语气，再选择自然回复",
  priority: "high",
  sourceMessageId: "message_1",
  dueAt: "2026-10-02T09:00:00.000Z",
  createdAt: "2026-10-02T08:00:00.000Z",
});

assert.equal(created.status, "pending_reply");
assert.equal(created.priority, "high");
assert.equal(created.sourceMessageId, "message_1");
assert.equal(created.createdAt, "2026-10-02T08:00:00.000Z");
assert.equal("password" in created, false);
assert.throws(() => task.createTask({ ...created, type: "unknown" }), /TASK_TYPE_INVALID/);
assert.throws(() => task.createTask({ ...created, status: "unknown" }), /TASK_STATUS_INVALID/);

const snoozed = task.transitionTask(created, "snoozed", "2026-10-02T10:00:00.000Z");
assert.equal(snoozed.status, "snoozed");
assert.equal(snoozed.updatedAt, "2026-10-02T10:00:00.000Z");
const reopened = task.transitionTask(snoozed, "pending_reply", "2026-10-02T11:00:00.000Z");
assert.equal(reopened.status, "pending_reply");
const done = task.transitionTask(reopened, "done", "2026-10-02T12:00:00.000Z");
assert.equal(done.completedAt, "2026-10-02T12:00:00.000Z");
assert.throws(() => task.transitionTask(done, "pending_reply"), /TASK_TRANSITION_INVALID/);

console.log("test-maintenance-task: ok");
