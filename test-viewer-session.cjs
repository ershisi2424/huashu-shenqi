const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-viewer-session-"));
process.env.AUTH_DB_PATH = path.join(root, "auth.sqlite");
const authSession = require("./lib/auth-session.cjs");
const store = authSession.getAuthStore();
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
const operatorA = store.registerOperator({ phone: "13900139000", name: "运营甲", password: "operator-password-a" });
store.approveOperator({ operatorId: operatorA.id, approvedBy: admin.id });
const operatorB = store.registerOperator({ phone: "13900139001", name: "运营乙", password: "operator-password-b" });
store.approveOperator({ operatorId: operatorB.id, approvedBy: admin.id });
const anchorA = store.createAnchor({ operatorId: operatorA.id, phone: "13700137000", name: "主播甲", password: "anchor-password-a" });
const anchorB = store.createAnchor({ operatorId: operatorB.id, phone: "13700137001", name: "主播乙", password: "anchor-password-b" });
const brotherA = store.createChatBrother({ actor: anchorA, clientId: "viewer-a", nickname: "甲哥" });
const brotherB = store.createChatBrother({ actor: anchorB, clientId: "viewer-b", nickname: "乙哥" });
store.saveWorkspaceSnapshot({ actor: anchorA, brotherId: brotherA.id, snapshot: { latestDraft: "甲的草稿", replies: [] } });
store.saveWorkspaceSnapshot({ actor: anchorB, brotherId: brotherB.id, snapshot: { latestDraft: "乙的草稿", replies: [] } });

function loadHandler(relativePath) {
  const source = fs.readFileSync(path.join(__dirname, relativePath), "utf8")
    .replace(/^import \{([^}]+)\} from .*auth-session\.cjs.*$/m, "const {$1} = authSession;")
    .replace(/^export default async function handler/m, "async function handler");
  const context = { console, JSON, String, Number, Date, process, authSession };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.handler = handler;`, context);
  return context.handler;
}

async function call(handler, { cookie = "", query = {} } = {}) {
  let status = 200;
  let payload;
  const headers = {};
  const req = { method: "GET", query, headers: { cookie }, socket: { remoteAddress: "127.0.0.1" } };
  const res = {
    setHeader(name, value) { headers[name] = value; },
    status(value) { status = value; return this; },
    json(value) { payload = value; return this; },
  };
  await handler(req, res);
  return { status, payload, headers };
}

function viewerHarness({ fetch, initial = {} }) {
  const source = fs.readFileSync(path.join(__dirname, "components/chat/ReadonlyAnchorWorkspace.js"), "utf8");
  const start = source.indexOf("export default function ReadonlyAnchorWorkspace()");
  const end = source.indexOf("  return <div", start);
  assert.ok(start >= 0 && end > start, "只读工作台组件入口应存在");
  const body = source.slice(start, end).replace("export default ", "");
  const names = [...body.matchAll(/const \[(\w+),\s*\w+\] = useState\(/g)].map((match) => match[1]);
  const state = {};
  const effects = [];
  let cursor = 0;
  const context = {
    fetch, basePath: "/test-base", encodeURIComponent, Error,
    useRouter: () => ({ isReady: true, query: { anchorId: "next-anchor" } }),
    useState(value) {
      const name = names[cursor++];
      state[name] = Object.hasOwn(initial, name) ? initial[name] : value;
      return [state[name], (next) => { state[name] = typeof next === "function" ? next(state[name]) : next; }];
    },
    useMemo: (makeValue) => makeValue(),
    useEffect: (effect) => effects.push(effect),
  };
  vm.createContext(context);
  vm.runInContext(`${body}\n}\nReadonlyAnchorWorkspace();`, context);
  return { state, start: effects[0] };
}

const response = (status, payload) => ({ status, ok: status >= 200 && status < 300, json: async () => payload });
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function testViewerLifecycle() {
  const calls = [];
  let completeAuth;
  const authPending = new Promise((resolve) => { completeAuth = resolve; });
  const oldPayload = { anchor: { id: "old-anchor" }, brothers: [{ id: "old-brother", nickname: "旧对象" }] };
  const viewer = viewerHarness({
    initial: { payload: oldPayload, activeId: "old-brother", currentUser: { role: "operator" }, operatorNotes: [{ body: "旧点评" }], noteDraft: "旧草稿" },
    fetch: (url, options) => {
      calls.push({ url, options });
      return calls.length === 1 ? authPending : Promise.resolve(response(403, { error: "无权查看该主播工作台" }));
    },
  });
  viewer.start();
  assert.equal(calls.length, 1, "认证尚未返回前不能启动快照请求");
  assert.ok(calls[0].url.endsWith("/api/auth/me/"));
  assert.equal(viewer.state.payload, null, "切换主播时必须清空旧快照，避免认证失败后露出旧聊天");
  assert.equal(viewer.state.activeId, "");
  assert.equal(viewer.state.operatorNotes.length, 0, "切换主播时必须清空旧点评");
  assert.equal(viewer.state.noteDraft, "", "切换主播时必须清空旧点评草稿");
  completeAuth(response(200, { user: { role: "operator" } }));
  await flush();
  assert.equal(calls.length, 2);
  assert.ok(calls[1].url.includes("/api/chat/workspace-snapshots/?anchorId=next-anchor"));
  for (const call of calls) assert.equal(call.options.cache, "no-store");
  assert.equal(viewer.state.error, "无权查看该主播工作台");
  assert.equal(viewer.state.authExpired, false, "403 不应被误判为登录失效");
  assert.equal(viewer.state.payload, null);

  for (const [status, user, expectedError, expired] of [
    [401, null, "当前登录已失效", true],
    [200, { role: "anchor" }, "当前账号无权查看主播工作台", false],
  ]) {
    let count = 0;
    const denied = viewerHarness({ fetch: async () => { count++; return response(status, { user }); } });
    denied.start();
    await flush();
    assert.equal(count, 1, "未登录及普通主播都不得请求只读快照");
    assert.equal(denied.state.error, expectedError);
    assert.equal(denied.state.authExpired, expired);
  }
}

(async () => {
  const api = loadHandler("pages/api/chat/workspace-snapshots.js");
  const operatorACookie = `hh_session=${store.createSession({ userId: operatorA.id }).token}`;
  const operatorBCookie = `hh_session=${store.createSession({ userId: operatorB.id }).token}`;

  const own = await call(api, { cookie: operatorACookie, query: { anchorId: anchorA.id } });
  assert.equal(own.status, 200, "所属运营查看主播快照应成功");
  assert.equal(own.payload.anchor.id, anchorA.id);
  assert.equal(own.payload.brothers[0].workspace.latestDraft, "甲的草稿");
  assert.match(own.headers["Cache-Control"], /private, no-store/);

  const cross = await call(api, { cookie: operatorACookie, query: { anchorId: anchorB.id } });
  assert.equal(cross.status, 403, "运营不能读取其他运营名下主播");

  const noCookie = await call(api, { query: { anchorId: anchorA.id } });
  assert.equal(noCookie.status, 401, "未登录不能读取主播工作台");
  assert.match(noCookie.headers["Cache-Control"], /private, no-store/);
  assert.match(cross.headers["Cache-Control"], /private, no-store/);
  const otherOwn = await call(api, { cookie: operatorBCookie, query: { anchorId: anchorB.id } });
  assert.equal(otherOwn.status, 200);
  const anchorCookie = `hh_session=${store.createSession({ userId: anchorA.id }).token}`;
  assert.equal((await call(api, { cookie: anchorCookie, query: { anchorId: anchorA.id } })).status, 403);
  const adminCookie = `hh_session=${store.createSession({ userId: admin.id }).token}`;
  assert.equal((await call(api, { cookie: adminCookie, query: { anchorId: anchorB.id } })).status, 200);

  const viewer = fs.readFileSync(path.join(__dirname, "components/chat/ReadonlyAnchorWorkspace.js"), "utf8");
  const authIndex = viewer.indexOf("/api/auth/me/");
  const snapshotIndex = viewer.indexOf("/api/chat/workspace-snapshots/");
  assert.ok(authIndex >= 0 && snapshotIndex > authIndex, "只读工作台必须先完成认证检查，再请求快照");
  assert.match(viewer, /fetch\(`\$\{basePath\}\/api\/auth\/me\/`, \{ cache: "no-store" \}\)/, "认证请求必须禁止缓存");
  assert.match(viewer, /fetch\(`\$\{basePath\}\/api\/chat\/workspace-snapshots\/\?anchorId=\$\{encodeURIComponent\(router.query.anchorId\)\}`, \{ cache: "no-store" \}\)/, "快照请求必须禁止缓存");
  assert.ok(viewer.includes("当前登录已失效"), "认证失效必须给出明确提示");
  assert.ok(viewer.includes("去登录"), "认证失效必须提供登录入口");
  assert.ok(!/router\.(replace|push)\(/.test(viewer), "只读工作台不得把 403 误跳登录");
  await testViewerLifecycle();

  store.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log("test-viewer-session: ok");
})().catch((error) => {
  console.error(error);
  try { store.close(); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
  process.exit(1);
});
