const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-guest-profile-"));
const dbPath = path.join(root, "auth.sqlite");
process.env.AUTH_DB_PATH = dbPath;
process.env.AUTH_REQUIRED = "true";
process.env.GUEST_PHONE_HMAC_SECRET = "guest-profile-test-secret";
process.env.ZAI_API_KEY = "test-key";

const authSession = require("./lib/auth-session.cjs");
const { createAuthStore } = require("./lib/auth-store.cjs");
const store = authSession.getAuthStore();
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });

async function loadProfileHandler(provider) {
  const runtime = await import("./lib/goutoujunshi-runtime/index.js");
  const contract = await import("./lib/goutoujunshi-runtime/contract.js");
  const coreSource = fs.readFileSync(path.join(__dirname, "lib/goutoujunshi-core.js"), "utf8")
    .replace(/^export const /gm, "const ")
    .replace(/^export function /gm, "function ");
  const profileSource = fs.readFileSync(path.join(__dirname, "pages/api/profile.js"), "utf8")
    .replace(/^import .*knowledge-router.*$/m, "const routeKnowledge = () => null;")
    .replace(/^import .*goutoujunshi-core.*$/m, "")
    .replace(/^import .*goutoujunshi-runtime\/index\.js.*$/m, "")
    .replace(/^import .*goutoujunshi-runtime\/contract\.js.*$/m, "")
    .replace(/^import \{([^}]+)\} from .*auth-session\.cjs.*$/m, "const {$1} = authSession;")
    .replace(/^import \{([^}]+)\} from .*ai-provider\.cjs.*$/m, "const {$1} = provider;")
    .replace(/^import .*reply-style\.cjs.*$/m, "const { normalizeReplyStyle, replyStyleInstruction } = replyStyle;")
    .replace(/^import fs from "node:fs";$/m, "")
    .replace(/^import path from "node:path";$/m, "")
    .replace("export default async function handler", "async function handler");
  const source = `${coreSource}\n${profileSource}\nglobalThis.profileHandler = handler;`;
  const context = {
    console,
    Map,
    Date,
    String,
    Number,
    JSON,
    Array,
    Object,
    AbortSignal,
    fetch: async () => ({ ok: true, status: 200, async json() { return {}; } }),
    fs,
    path,
    authSession,
    provider,
    replyStyle: require("./lib/reply-style.cjs"),
    analyzeGoutoujunshiRuntime: runtime.analyzeGoutoujunshiRuntime,
    validateGenerationAgainstRuntime: contract.validateGenerationAgainstRuntime,
    process,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.profileHandler;
}

function aiPayload(replyCount) {
  return {
    choices: [{ message: { content: JSON.stringify({
      profile: { summary: "信息有限", interests: [], communicationStyle: "自然", preferredTopics: [], avoidTopics: [], evidence: [], confidence: 10 },
      strategy: { approach: ["先承接", "留空间"], boundaries: ["不越界"] },
      replies: Array.from({ length: replyCount }, (_, candidateIndex) => ({
        candidateIndex,
        style: `测试风格${candidateIndex + 1}`,
        text: `临时工作台原创回复${candidateIndex + 1}`,
        rationale: "根据当前消息进行原创表达",
        sendWhen: "对方刚发来消息时",
        branches: { positive: "继续接具体内容", ambiguous: "不连续追问", refusal: "尊重并收线" },
        observationWindow: "观察对方是否继续表达",
        stopCondition: "对方明确不想聊",
      })),
      riskNotice: "",
    }) } }],
  };
}

async function call(handler, { body = {}, cookie = "", remoteAddress = "guest-profile-test" } = {}) {
  let status = 200;
  let payload;
  const headers = {};
  const req = { method: "POST", body, headers: { cookie }, socket: { remoteAddress } };
  const res = {
    setHeader(name, value) { headers[name] = value; },
    status(value) { status = value; return this; },
    json(value) { payload = value; return this; },
  };
  await handler(req, res);
  return { status, payload, headers };
}

(async () => {
  let providerCalls = 0;
  const materials = [];
  const provider = {
    ProviderRequestError: class ProviderRequestError extends Error {},
    async callChatCompletion({ messages }) {
      providerCalls += 1;
      materials.push(JSON.parse(messages[1].content));
      return { model: "glm-5.3", payload: aiPayload(4) };
    },
  };
  const handler = await loadProfileHandler(provider);
  const guestSession = store.createGuestSession("13900139000");
  const guestCookie = `hh_guest_session=${guestSession.token}`;

  const beforeDb = require("better-sqlite3")(dbPath);
  const before = {
    users: beforeDb.prepare("SELECT COUNT(*) AS count FROM users").get().count,
    chatBrothers: beforeDb.prepare("SELECT COUNT(*) AS count FROM chat_brothers").get().count,
    chatAudit: beforeDb.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action LIKE 'chat.%'").get().count,
  };
  beforeDb.close();
  const success = await call(handler, {
    cookie: guestCookie,
    body: {
      consent: true,
      account: "临时对象",
      currentMessage: "晚上好，今天忙吗？",
      replyCount: 4,
      sources: { works: "", comments: "", statements: "" },
    },
  });
  assert.equal(success.status, 200, "游客不带正式 ID 应进入 Runtime/GLM 链路");
  assert.equal(success.payload.provider, "zhipu");
  assert.equal(success.payload.model, "glm-5.3");
  assert.equal(success.payload.replies.length, 4);
  assert.equal(providerCalls, 1);
  assert.equal(materials[0].brotherId, "", "游客请求不得携带正式维护对象 ID");
  assert.equal(materials[0].sourceMessageId, "", "游客请求不得携带正式消息 ID");
  assert.equal(materials[0].maintenanceTask, null, "游客请求不得携带正式维护任务");
  assert.equal(materials[0].currentMessage, "晚上好，今天忙吗？");
  assert.equal(success.headers["Cache-Control"], "private, no-store, max-age=0");

  for (const body of [
    { brotherId: "formal-brother" },
    { sourceMessageId: "formal-message" },
    { maintenanceTask: { id: "formal-task" } },
    { maintenanceTaskMode: "use", maintenanceTask: { id: "formal-task" } },
  ]) {
    const denied = await call(handler, { cookie: guestCookie, body: { consent: true, currentMessage: "继续吗", ...body } });
    assert.equal(denied.status, 403, "游客提交正式作用域字段必须拒绝");
    assert.equal(denied.payload.code, "GUEST_SCOPE_FORBIDDEN");
  }
  assert.equal(providerCalls, 1, "越权请求不得触发 AI 调用");

  const formalSession = store.createSession({ userId: admin.id });
  const formalBrother = store.createChatBrother({ actor: admin, clientId: "formal-profile-brother", nickname: "正式对象" });
  const invalidFormalSource = await call(handler, {
    cookie: `hh_session=${formalSession.token}`,
    remoteAddress: "formal-profile-source-test",
    body: { consent: true, brotherId: formalBrother.id, sourceMessageId: "missing-source", currentMessage: "浏览器伪造内容", replyCount: 4 },
  });
  assert.equal(invalidFormalSource.status, 409, "正式对象的不存在来源消息必须在进入 AI 前拒绝");
  assert.equal(invalidFormalSource.payload.code, "CHAT_SOURCE_MESSAGE_INVALID");
  assert.equal(providerCalls, 1, "来源消息校验失败不得触发 AI 调用");
  const formal = await call(handler, {
    cookie: `hh_session=${formalSession.token}`,
    remoteAddress: "formal-profile-test",
    body: { consent: true, account: "正式临时对象", currentMessage: "正式账号回归", replyCount: 4 },
  });
  assert.equal(formal.status, 200, "正式账号无正式对象 ID 的旧 profile 调用应保持可用");
  assert.equal(providerCalls, 2);
  assert.equal(materials[1].currentMessage, "正式账号回归");

  // A guest generation must not create formal users, chat rows, audit rows or AI usage events.
  const db = require("better-sqlite3")(dbPath);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM users").get().count, before.users);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM chat_brothers").get().count, before.chatBrothers + 1, "只允许测试正式来源边界时创建的正式对象存在");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM chat_messages").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action LIKE 'chat.%'").get().count, before.chatAudit + 1, "来源边界测试创建正式对象时只允许增加一条对象审计");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM ai_usage_events WHERE actor_user_id = ?").get(admin.id).count, 1, "只有正式回归请求可写一条正式 AI usage");
  db.close();
  store.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log("test-guest-profile-api: ok");
})().catch((error) => {
  console.error(error);
  try { store.close(); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
  process.exit(1);
});
