const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const Database = require("better-sqlite3");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-reply-runtime-context-"));
const dbPath = path.join(root, "auth.sqlite");
process.env.AUTH_DB_PATH = dbPath;
const { getAuthStore } = require("./lib/auth-session.cjs");
const { getMigrationLedger } = require("./lib/db-migrations.cjs");
const localStore = require("./lib/chat-local-store.cjs");
const store = getAuthStore();
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
const operator = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password" });
store.approveOperator({ operatorId: operator.id, approvedBy: admin.id });
const anchor = store.createAnchor({ operatorId: operator.id, phone: "13700137000", name: "主播一号", password: "anchor-password" });
const brother = store.createChatBrother({ actor: anchor, clientId: "runtime-context", nickname: "山哥" });
store.appendChatMessage({ actor: anchor, brotherId: brother.id, message: { id: "runtime-msg", sender: "brother", source: "paste", status: "confirmed", text: "今天项目收尾了" } });

const runtimeContext = {
  runtimeAnalysis: { primaryGoal: "承接", facts: ["今天项目收尾了"], unknowns: ["是否愿意继续聊"], stopCondition: "明确不想聊" },
  runtimeIntake: { needsProfile: false, questions: [] },
  runtime: { name: "goutoujunshi", sourceRevision: "test-revision" },
  openingTopics: ["最近项目"],
  liveInvite: { allowed: false, text: "", rationale: "本轮不需要" },
};

const first = store.saveReplyHistory({
  actor: anchor,
  brotherId: brother.id,
  sourceMessageId: "runtime-msg",
  replies: [{ style: "自然", text: "收尾了就好，今天辛苦了", rationale: "承接具体经历" }],
  ...runtimeContext,
});
assert.deepEqual(first.runtimeAnalysis, runtimeContext.runtimeAnalysis);
assert.deepEqual(first.runtimeIntake, runtimeContext.runtimeIntake);
assert.deepEqual(first.runtime, runtimeContext.runtime);
assert.deepEqual(first.openingTopics, runtimeContext.openingTopics);
assert.deepEqual(first.liveInvite, runtimeContext.liveInvite);
const listed = store.listReplyHistory({ actor: anchor, brotherId: brother.id });
assert.deepEqual(listed.items[0].runtimeAnalysis, runtimeContext.runtimeAnalysis);

const localValues = new Map();
const localStorage = {
  getItem(key) { return localValues.get(key) ?? null; },
  setItem(key, value) { localValues.set(key, value); },
  removeItem(key) { localValues.delete(key); },
};
assert.equal(localStore.writeReplyHistory(localStorage, "guest:runtime", "runtime-context", [{ id: "guest-history", brotherId: "runtime-context", currentMessage: "今天项目收尾了", replies: [{ text: "先歇会儿" }], ...runtimeContext }]), true);
assert.deepEqual(localStore.readReplyHistory(localStorage, "guest:runtime", "runtime-context")[0].openingTopics, runtimeContext.openingTopics);
assert.deepEqual(localStore.readReplyHistory(localStorage, "guest:runtime", "runtime-context")[0].liveInvite, runtimeContext.liveInvite);

const inspect = new Database(dbPath, { readonly: true, fileMustExist: true });
const columns = new Set(inspect.prepare("PRAGMA table_info(reply_history)").all().map((column) => column.name));
for (const column of ["runtime_analysis_json", "runtime_intake_json", "runtime_json", "opening_topics_json", "live_invite_json"]) assert.equal(columns.has(column), true, column);
assert.equal(getMigrationLedger(inspect).some((row) => row.id === "0003.reply-history-runtime-context"), true);
inspect.close();

function loadHandler(relativePath) {
  const source = fs.readFileSync(path.join(__dirname, relativePath), "utf8")
    .replace(/^import \{([^}]+)\} from .*auth-session\.cjs.*$/m, "const {$1} = authSession;")
    .replace(/^export default async function handler/m, "async function handler");
  const context = { console, JSON, String, Number, Date, process, authSession: require("./lib/auth-session.cjs") };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.handler = handler;`, context);
  return context.handler;
}

async function call(handler, { method = "GET", body = {}, cookie = "", query = {} } = {}) {
  let status = 200;
  let payload;
  const req = { method, body, query, headers: { cookie }, socket: { remoteAddress: "127.0.0.1" } };
  const res = { setHeader() {}, status(value) { status = value; return this; }, json(value) { payload = value; return this; } };
  await handler(req, res);
  return { status, payload };
}

(async () => {
  const api = loadHandler("pages/api/chat/reply-history.js");
  const cookie = `hh_session=${store.createSession({ userId: anchor.id }).token}`;
  const saved = await call(api, { method: "POST", cookie, body: { brotherId: brother.id, sourceMessageId: "runtime-msg", replies: [{ text: "继续聊聊", style: "自然" }], ...runtimeContext } });
  assert.equal(saved.status, 201);
  assert.deepEqual(saved.payload.item.runtimeAnalysis, runtimeContext.runtimeAnalysis);
  const listedFromApi = await call(api, { cookie, query: { brotherId: brother.id } });
  assert.deepEqual(listedFromApi.payload.items[0].runtime, runtimeContext.runtime);
  store.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log("test-chat-reply-history-runtime-context: ok");
})().catch((error) => { console.error(error); try { store.close(); } catch {} fs.rmSync(root, { recursive: true, force: true }); process.exit(1); });
