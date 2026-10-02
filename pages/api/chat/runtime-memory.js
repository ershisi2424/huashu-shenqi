import { getAuthStore, requireUser } from "../../../lib/auth-session.cjs";
import { normalizeMemoryCommand } from "../../../lib/goutoujunshi-runtime/memory.js";

function bodyOf(req) {
  return req.body && typeof req.body === "object" ? req.body : {};
}

function brotherIdOf(req) {
  return String(req.query?.brotherId || bodyOf(req).brotherId || "").trim();
}

function errorResponse(error) {
  const code = error?.message || "RUNTIME_MEMORY_FAILED";
  if (["CHAT_BROTHER_NOT_FOUND", "CHAT_ACCESS_DENIED", "RUNTIME_MEMORY_WRITE_DENIED", "OPERATOR_NOTE_ACCESS_DENIED"].includes(code)) {
    return { status: 403, payload: { error: "无权访问该维护对象的长期记忆", code: "FORBIDDEN" } };
  }
  if (code === "CONSENT_REQUIRED") return { status: 400, payload: { error: "请先明确同意启用长期记忆", code } };
  if (code === "MEMORY_PAUSED") return { status: 400, payload: { error: "长期记忆已暂停，请先恢复后再写入", code } };
  if (["SOURCE_NOT_ELIGIBLE", "INVALID_RUNTIME_MEMORY_DELTA", "MEMORY_LIMIT_REACHED", "MEMORY_UNDO_EMPTY"].includes(code)) {
    return { status: 400, payload: { error: "长期记忆变更不符合当前来源或状态限制", code } };
  }
  if (code === "RUNTIME_SCOPE_REQUIRED") return { status: 400, payload: { error: "缺少维护对象标识", code } };
  return { status: 500, payload: { error: "长期记忆服务暂时不可用", code: "RUNTIME_MEMORY_FAILED" } };
}

export default async function handler(req, res) {
  const actor = requireUser(req, res);
  if (!actor) return null;
  const store = getAuthStore();
  const brotherId = brotherIdOf(req);
  try {
    if (req.method === "GET") {
      if (!brotherId) return res.status(400).json({ error: "缺少维护对象标识", code: "RUNTIME_SCOPE_REQUIRED" });
      const listed = store.listRuntimeMemory({ actor, brotherId, limit: req.query?.limit });
      return res.status(200).json(listed);
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "仅支持 GET 或 POST" });
    }
    const command = normalizeMemoryCommand({ ...bodyOf(req), brotherId });
    if (command.action !== "clear" && !command.brotherId) return res.status(400).json({ error: "缺少维护对象标识", code: "RUNTIME_SCOPE_REQUIRED" });
    if (command.action === "status") {
      return res.status(200).json({ status: store.getRuntimeMemoryStatus({ actor, brotherId: command.brotherId }), ...store.listRuntimeMemory({ actor, brotherId: command.brotherId }) });
    }
    if (command.action === "enable") {
      if (command.consent !== true) return res.status(400).json({ error: "请先明确同意启用长期记忆", code: "CONSENT_REQUIRED" });
      return res.status(200).json({ status: store.enableRuntimeMemory({ actor, brotherId: command.brotherId }) });
    }
    if (command.action === "pause") return res.status(200).json({ status: store.pauseRuntimeMemory({ actor, brotherId: command.brotherId }) });
    if (command.action === "resume") return res.status(200).json({ status: store.resumeRuntimeMemory({ actor, brotherId: command.brotherId }) });
    if (command.action === "apply") return res.status(201).json({ item: store.applyRuntimeMemoryDelta({ actor, brotherId: command.brotherId, delta: command.delta }) });
    if (command.action === "undo") return res.status(200).json(store.undoRuntimeMemory({ actor, brotherId: command.brotherId }));
    if (command.action === "forget-object") return res.status(200).json(store.forgetRuntimeMemoryObject({ actor, brotherId: command.brotherId }));
    if (command.action === "revoke") return res.status(200).json(store.revokeRuntimeMemory({ actor, brotherId: command.brotherId }));
    if (command.action === "clear") return res.status(200).json(store.clearRuntimeMemory({ actor }));
    return res.status(400).json({ error: "不支持的长期记忆操作", code: "RUNTIME_MEMORY_ACTION_INVALID" });
  } catch (error) {
    const response = errorResponse(error);
    console.error("Runtime memory API failed", error?.message || "Error");
    return res.status(response.status).json(response.payload);
  }
}
