import { MAX_LIMITS, SOURCE_TYPES } from "./constants.js";

// Runtime 输入边界说明：这里是所有 Runtime 请求的第一道归一化边界。
// 它负责限制字段长度、清理控制字符、固定 actor/subject 作用域，并保留
// 说话人映射和素材来源；不要在这里根据姓名、性别或标签补写未经证实的事实。

function clean(value, limit) {
  return typeof value === "string"
    ? value.replace(/\u0000/g, "").replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, limit)
    : "";
}

function sourceType(value) {
  return SOURCE_TYPES.includes(value) ? value : "unknown";
}

function normalizeHistory(history) {
  return (Array.isArray(history) ? history : []).slice(0, MAX_LIMITS.history).map((row) => ({
    sender: ["brother", "anchor"].includes(row?.sender) ? row.sender : "unknown",
    message: clean(row?.message || row?.msg, 500),
    reply: clean(row?.reply || row?.response, 500),
    source: sourceType(row?.source),
    occurredAt: clean(row?.occurredAt || row?.createdAt, 64),
  })).filter((row) => row.message || row.reply);
}

function normalizeProfileValue(value, depth = 0) {
  if (depth > 2) return "";
  if (typeof value === "string") return clean(value, MAX_LIMITS.profileField);
  if (Array.isArray(value)) return value
    .slice(0, 8)
    .map((item) => normalizeProfileValue(item, depth + 1))
    .filter((item) => item !== "" && !(Array.isArray(item) && item.length === 0));
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).slice(0, 12).map(([key, item]) => [clean(key, 64), normalizeProfileValue(item, depth + 1)])
      .filter(([key, item]) => key && item !== "" && !(Array.isArray(item) && item.length === 0)),
  );
  return "";
}

function normalizeProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return {};
  return Object.fromEntries(Object.entries(profile).slice(0, 16).map(([key, value]) => [
    clean(key, 64),
    normalizeProfileValue(value),
  ]).filter(([key]) => key));
}

export function normalizeRuntimeInput(raw = {}) {
  const actor = raw.actor && typeof raw.actor === "object" ? raw.actor : {};
  const subject = raw.subject && typeof raw.subject === "object" ? raw.subject : {};
  const userId = clean(actor.userId || actor.id, 120);
  const brotherId = clean(subject.brotherId || subject.id, 120);
  if (!userId || !brotherId) {
    const error = new Error("Runtime 需要主播账号和维护对象唯一 ID");
    error.code = "RUNTIME_SCOPE_REQUIRED";
    throw error;
  }
  const sourceInput = raw.sources && typeof raw.sources === "object" ? raw.sources : {};
  const speakerMapping = raw.speakerMapping && typeof raw.speakerMapping === "object" ? raw.speakerMapping : {};
  return {
    // Keep both aliases: Runtime namespace code uses userId, while the
    // server-side auth store resolves the active account by id.
    actor: { id: userId, userId, role: clean(actor.role, 40) || "anchor" },
    subject: { brotherId, alias: clean(subject.alias || subject.nickname, MAX_LIMITS.alias) },
    currentMessage: clean(raw.currentMessage, MAX_LIMITS.currentMessage),
    history: normalizeHistory(raw.history),
    sources: {
      works: clean(sourceInput.works, MAX_LIMITS.source),
      comments: clean(sourceInput.comments, MAX_LIMITS.source),
      statements: clean(sourceInput.statements, MAX_LIMITS.source),
      transcript: clean(sourceInput.transcript, MAX_LIMITS.source),
      ocrMessages: clean(sourceInput.ocrMessages, MAX_LIMITS.source),
    },
    speakerMapping: {
      brother: clean(speakerMapping.brother, 80),
      anchor: clean(speakerMapping.anchor, 80),
      confirmed: speakerMapping.confirmed === true,
    },
    profile: normalizeProfile(raw.profile),
    memory: raw.memory && typeof raw.memory === "object" ? { ...raw.memory } : {},
    replyPreferences: Array.isArray(raw.replyPreferences) ? raw.replyPreferences.filter((item) => typeof item === "string").map((item) => clean(item, 80)).filter(Boolean).slice(0, 8) : [],
    replyStyle: clean(raw.replyStyle, 40),
    limits: { ...MAX_LIMITS },
  };
}
