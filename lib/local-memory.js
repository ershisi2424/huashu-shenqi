export const MEMORY_STORAGE_KEY = "hh_memory_v2";

const LEGACY_KEYS = {
  history: "hh_history",
  favorites: "hh_fav",
  brothers: "hh_brothers",
  preferences: "hh_prefs",
};

function legacyValue(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function validSnapshot(value) {
  return value && value.version === 2 && Array.isArray(value.history)
    && Array.isArray(value.favorites) && Array.isArray(value.brothers)
    && value.preferences && typeof value.preferences === "object" && !Array.isArray(value.preferences);
}

export function readMemoryState(storage) {
  const raw = storage.getItem(MEMORY_STORAGE_KEY);
  if (raw !== null) {
    const snapshot = JSON.parse(raw);
    if (!validSnapshot(snapshot)) throw new Error("INVALID_MEMORY_SNAPSHOT");
    return snapshot;
  }
  return {
    version: 2,
    history: legacyValue(storage, LEGACY_KEYS.history, []),
    favorites: legacyValue(storage, LEGACY_KEYS.favorites, []),
    brothers: legacyValue(storage, LEGACY_KEYS.brothers, []),
    preferences: legacyValue(storage, LEGACY_KEYS.preferences, {}),
  };
}

export function writeMemoryState(storage, snapshot) {
  if (!validSnapshot(snapshot)) throw new Error("INVALID_MEMORY_SNAPSHOT");
  storage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(snapshot));
  for (const key of Object.values(LEGACY_KEYS)) {
    try { storage.removeItem(key); } catch { /* The new snapshot remains authoritative. */ }
  }
}

export function updateMemorySection(storage, section, value) {
  if (!Object.hasOwn(LEGACY_KEYS, section)) throw new Error("INVALID_MEMORY_SECTION");
  writeMemoryState(storage, { ...readMemoryState(storage), [section]: value });
}
