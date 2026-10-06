const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

const chatLocalStore = require("./lib/chat-local-store.cjs");
const { createAuthStore } = require("./lib/auth-store.cjs");

assert.equal(typeof chatLocalStore.activeBrotherStorageKey, "function", "应提供按主播隔离的当前维护对象存储键");
assert.equal(chatLocalStore.activeBrotherStorageKey("user:anchor-1"), "hh_chat_v1:user_anchor-1:active");

const browserStorage = new Map();
const storage = {
  getItem(key) { return browserStorage.has(key) ? browserStorage.get(key) : null; },
  setItem(key, value) { browserStorage.set(key, String(value)); },
  removeItem(key) { browserStorage.delete(key); },
};
chatLocalStore.writeActiveBrotherId(storage, "user:anchor-1", "bro_002");
assert.equal(chatLocalStore.readActiveBrotherId(storage, "user:anchor-1"), "bro_002");
assert.equal(chatLocalStore.readActiveBrotherId(storage, "user:anchor-2"), null, "不同主播不能读取其他主播的当前对象");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-chat-brother-order-"));
const databasePath = path.join(root, "auth.sqlite");
const store = createAuthStore({ filename: databasePath });
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
const operator = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password" });
store.approveOperator({ operatorId: operator.id, approvedBy: admin.id });
const anchor = store.createAnchor({ operatorId: operator.id, phone: "13700137000", name: "主播一号", password: "anchor-password" });
for (const clientId of ["bro_001", "bro_002", "bro_003"]) {
  store.createChatBrother({ actor: anchor, clientId, nickname: clientId });
}

const database = new Database(databasePath);
database.prepare("UPDATE chat_brothers SET created_at = ?, updated_at = ? WHERE owner_user_id = ?").run("2026-10-02T00:00:00.000Z", "2026-10-02T00:00:00.000Z", anchor.id);
database.close();

const ordered = store.listChatBrothers({ actor: anchor });
assert.deepEqual(ordered.map((item) => item.clientId), ["bro_003", "bro_002", "bro_001"], "相同时间戳时也必须使用稳定的次级排序");
store.close();
fs.rmSync(root, { recursive: true, force: true });
console.log("test-chat-brother-order: ok");
