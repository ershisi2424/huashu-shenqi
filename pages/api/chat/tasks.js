import { getAuthStore, requireUser } from "../../../lib/auth-session.cjs";

function bodyOf(req) {
  return req.body && typeof req.body === "object" ? req.body : {};
}

function errorResponse(res, error) {
  const code = error?.message || "";
  if (code === "TASK_NOT_FOUND") return res.status(404).json({ error: "找不到这条维护任务", code });
  if (["TASK_ACCESS_DENIED", "TASK_WRITE_DENIED", "CHAT_ACCESS_DENIED", "CHAT_BROTHER_NOT_FOUND"].includes(code)) return res.status(403).json({ error: "当前账号只能操作自己权限范围内的维护对象和任务", code: "FORBIDDEN" });
  if (["TASK_BROTHER_REQUIRED", "TASK_TITLE_REQUIRED", "TASK_TITLE_TOO_LONG", "TASK_TEXT_TOO_LONG", "TASK_REQUEST_ID_TOO_LONG", "TASK_TYPE_INVALID", "TASK_STATUS_INVALID", "TASK_TRANSITION_INVALID", "TASK_PRIORITY_INVALID", "TASK_DUE_AT_INVALID"].includes(code)) return res.status(400).json({ error: "维护任务内容不完整或格式不正确", code });
  console.error("Maintenance tasks failed", code || "Error");
  return res.status(500).json({ error: "维护任务暂时不可用", code: "TASKS_UNAVAILABLE" });
}

export default async function handler(req, res) {
  const actor = requireUser(req, res);
  if (!actor) return null;
  const store = getAuthStore();
  if (req.method === "GET") {
    try {
      const query = req.query || {};
      return res.status(200).json(store.listMaintenanceTasks({ actor, brotherId: query.brotherId, status: query.status, limit: query.limit }));
    } catch (error) {
      return errorResponse(res, error);
    }
  }
  if (req.method === "POST") {
    try {
      const body = bodyOf(req);
      const item = store.createMaintenanceTask({ actor, brotherId: body.brotherId, type: body.type, priority: body.priority, title: body.title, reason: body.reason, nextAction: body.nextAction, dueAt: body.dueAt, requestId: body.requestId });
      return res.status(201).json({ item });
    } catch (error) {
      return errorResponse(res, error);
    }
  }
  if (req.method === "PATCH") {
    try {
      const body = bodyOf(req);
      const item = store.updateMaintenanceTask({ actor, taskId: body.taskId, status: body.status, priority: body.priority, title: body.title, reason: body.reason, nextAction: body.nextAction, dueAt: body.dueAt });
      return res.status(200).json({ item });
    } catch (error) {
      return errorResponse(res, error);
    }
  }
  res.setHeader("Allow", "GET, POST, PATCH");
  return res.status(405).json({ error: "仅支持 GET、POST 或 PATCH" });
}
