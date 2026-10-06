const TASK_TYPES = new Set(["reply", "follow_up", "greeting", "emotion"]);
const TASK_STATUSES = new Set(["pending_reply", "follow_up", "snoozed", "done", "dismissed"]);
const TASK_PRIORITIES = new Set(["high", "normal", "low"]);
const TRANSITIONS = {
  pending_reply: new Set(["follow_up", "snoozed", "done", "dismissed"]),
  follow_up: new Set(["pending_reply", "snoozed", "done", "dismissed"]),
  snoozed: new Set(["pending_reply", "follow_up", "done", "dismissed"]),
  done: new Set(),
  dismissed: new Set(),
};

function cleanText(value, maxLength = 500) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, maxLength) : "";
}

function iso(value, fallback = new Date().toISOString()) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return fallback;
}

function assertId(value, code) {
  const id = cleanText(value, 120);
  if (!id) throw new Error(code);
  return id;
}

function normalizeTask(input = {}) {
  const type = cleanText(input.type, 40);
  if (!TASK_TYPES.has(type)) throw new Error("TASK_TYPE_INVALID");
  const status = cleanText(input.status || "pending_reply", 40);
  if (!TASK_STATUSES.has(status)) throw new Error("TASK_STATUS_INVALID");
  const priority = cleanText(input.priority || "normal", 20);
  if (!TASK_PRIORITIES.has(priority)) throw new Error("TASK_PRIORITY_INVALID");
  const createdAt = iso(input.createdAt);
  return {
    id: assertId(input.id, "TASK_ID_REQUIRED"),
    brotherId: assertId(input.brotherId, "TASK_BROTHER_REQUIRED"),
    ownerUserId: assertId(input.ownerUserId, "TASK_OWNER_REQUIRED"),
    operatorId: cleanText(input.operatorId, 120) || null,
    type,
    status,
    priority,
    title: cleanText(input.title, 120) || "维护跟进",
    reason: cleanText(input.reason, 1000),
    nextAction: cleanText(input.nextAction, 1000),
    sourceMessageId: cleanText(input.sourceMessageId, 120) || null,
    requestId: cleanText(input.requestId, 120) || null,
    dueAt: input.dueAt ? iso(input.dueAt, null) : null,
    createdAt,
    updatedAt: iso(input.updatedAt, createdAt),
    completedAt: input.completedAt ? iso(input.completedAt, null) : null,
  };
}

function createTask(input = {}) {
  return normalizeTask(input);
}

function transitionTask(task, nextStatus, changedAt = new Date().toISOString()) {
  const current = normalizeTask(task);
  const next = cleanText(nextStatus, 40);
  if (!TASK_STATUSES.has(next)) throw new Error("TASK_STATUS_INVALID");
  if (current.status !== next && !TRANSITIONS[current.status]?.has(next)) throw new Error("TASK_TRANSITION_INVALID");
  const timestamp = iso(changedAt);
  return {
    ...current,
    status: next,
    updatedAt: timestamp,
    completedAt: ["done", "dismissed"].includes(next) ? (current.completedAt || timestamp) : null,
  };
}

module.exports = {
  TASK_TYPES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  createTask,
  normalizeTask,
  transitionTask,
};
