const ACTIONS = new Set(["status", "enable", "pause", "resume", "apply", "undo", "forget-object", "revoke", "clear"]);

export function memoryNamespace(actorId, brotherId) {
  const owner = typeof actorId === "string" ? actorId.trim() : "";
  const subject = typeof brotherId === "string" ? brotherId.trim() : "";
  if (!owner || !subject) throw new Error("RUNTIME_SCOPE_REQUIRED");
  return `${owner}:${subject}`;
}

export function normalizeMemoryCommand(raw = {}) {
  const action = typeof raw.action === "string" && ACTIONS.has(raw.action) ? raw.action : "status";
  return {
    action,
    brotherId: typeof raw.brotherId === "string" ? raw.brotherId.trim().slice(0, 120) : "",
    consent: raw.consent === true,
    delta: raw.delta && typeof raw.delta === "object" ? { ...raw.delta } : null,
  };
}

export function buildMemoryContext(rows = []) {
  return (Array.isArray(rows) ? rows : []).slice(0, 40).map((row) => ({
    scope: typeof row?.scope === "string" ? row.scope : "",
    field: typeof row?.field === "string" ? row.field : "",
    value: typeof row?.value === "string" ? row.value : "",
    sourceType: typeof row?.sourceType === "string" ? row.sourceType : "",
    confidence: typeof row?.confidence === "string" ? row.confidence : "low",
    occurredAt: row?.occurredAt || null,
  })).filter((row) => row.scope && row.field && row.value);
}
