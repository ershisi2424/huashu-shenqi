export function normalizeBrothers(rows) {
  if (!Array.isArray(rows)) return [];
  const merged = new Map();
  for (const row of rows.filter(Boolean)) {
    const key = (row.nickname || "").trim() || row.id;
    if (!key) continue;
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, { ...row, sessions: Array.isArray(row.sessions) ? row.sessions : [] });
      continue;
    }
    const sessions = [...(row.sessions || []), ...(previous.sessions || [])]
      .filter((item, index, all) => item?.id && all.findIndex(other => other.id === item.id) === index)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .slice(0, 100);
    merged.set(key, {
      ...previous,
      ...row,
      id: previous.id || row.id,
      sessions,
      interactionCount: Math.max(row.interactionCount || 0, previous.interactionCount || 0, sessions.length),
    });
  }
  return [...merged.values()]
    .sort((a, b) => (b.lastInteraction || b.ts || 0) - (a.lastInteraction || a.ts || 0))
    .slice(0, 200);
}
