/* eslint-disable */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

let source = fs.readFileSync(__dirname + "/lib/local-memory.js", "utf8")
  .replace(/^export (const|function) /gm, "$1 ");
source += "\nglobalThis.memoryApi={readMemoryState,writeMemoryState,updateMemorySection,MEMORY_STORAGE_KEY};";
const context = { JSON, Array, Object, String };
vm.createContext(context);
vm.runInContext(source, context);
const { readMemoryState, writeMemoryState, updateMemorySection, MEMORY_STORAGE_KEY } = context.memoryApi;

function fakeStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  let failWrites = false;
  return {
    entries,
    getItem(key) { return entries.has(key) ? entries.get(key) : null; },
    setItem(key, value) {
      if (failWrites) throw new Error("QuotaExceededError");
      entries.set(key, String(value));
    },
    removeItem(key) { entries.delete(key); },
    fail() { failWrites = true; },
  };
}

const original = { version: 2, history: [{ id: "old", msg: "旧消息" }], favorites: [], brothers: [{ id: "bro1", nickname: "陈哥" }], preferences: { intensity: "daily" } };
const imported = { version: 2, history: [{ id: "new", msg: "新消息" }], favorites: [{ text: "你好" }], brothers: [], preferences: { intensity: "auto" } };
const storage = fakeStorage({ [MEMORY_STORAGE_KEY]: JSON.stringify(original) });
storage.fail();
assert.throws(() => writeMemoryState(storage, imported), /QuotaExceededError/, "导入写入失败应暴露错误");
assert.equal(storage.getItem(MEMORY_STORAGE_KEY), JSON.stringify(original), "写入失败后整个旧快照必须保持不变");

const writable = fakeStorage({ [MEMORY_STORAGE_KEY]: JSON.stringify(original) });
updateMemorySection(writable, "favorites", [{ text: "收藏" }]);
const updated = readMemoryState(writable);
assert.equal(updated.history[0].id, "old", "单项更新应保留历史");
assert.equal(updated.brothers[0].id, "bro1", "单项更新应保留档案");
assert.equal(updated.favorites[0].text, "收藏", "单项更新应写入目标分区");

const legacy = fakeStorage({ hh_history: JSON.stringify([{ id: "legacy", msg: "旧版历史" }]), hh_fav: "[]", hh_brothers: "[]", hh_prefs: "{}" });
assert.equal(readMemoryState(legacy).history[0].id, "legacy", "没有新快照时应能读取旧版记忆");
assert.equal(legacy.getItem(MEMORY_STORAGE_KEY), null, "读取旧版记忆不应自行写入");
updateMemorySection(legacy, "history", [{ id: "migrated", msg: "迁移后" }]);
assert.equal(readMemoryState(legacy).history[0].id, "migrated", "更新旧版记忆时应迁移到新快照");
assert.equal(legacy.getItem("hh_history"), null, "新快照成功后应移除旧历史键");

console.log("✅ 本地记忆单快照与旧版兼容测试通过");
