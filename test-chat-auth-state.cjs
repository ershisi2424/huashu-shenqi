const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  AUTH_SCOPE_LOGOUT_KEY,
  AUTH_SCOPE_STORAGE_KEY,
  clearLastAuthScope,
  readLastAuthScope,
  writeLastAuthScope,
  resolveUnauthenticatedState,
} = require("./lib/chat-auth-state.cjs");

const values = new Map();
const storage = {
  get length() { return values.size; },
  key(index) { return Array.from(values.keys())[index] ?? null; },
  getItem(key) { return values.get(key) ?? null; },
  setItem(key, value) { values.set(key, value); },
  removeItem(key) { values.delete(key); },
};

assert.equal(AUTH_SCOPE_STORAGE_KEY, "hh_chat_last_auth_scope_v1");
assert.equal(writeLastAuthScope(storage, "user:anchor-1"), true);
assert.equal(readLastAuthScope(storage), "user:anchor-1");
assert.deepEqual(resolveUnauthenticatedState(storage), { scope: "user:anchor-1", status: "expired" });

clearLastAuthScope(storage);
assert.equal(readLastAuthScope(storage), "");
assert.deepEqual(resolveUnauthenticatedState(storage), { scope: "guest", status: "guest" });

values.delete(AUTH_SCOPE_LOGOUT_KEY);
storage.setItem("hh_chat_session_v1:user_anchor-legacy", "{}");
assert.deepEqual(resolveUnauthenticatedState(storage), { scope: "user:anchor-legacy", status: "expired" }, "旧版账号会话也应恢复作用域");
clearLastAuthScope(storage);
assert.deepEqual(resolveUnauthenticatedState(storage), { scope: "guest", status: "guest" }, "主动退出后不能重新推断旧账号作用域");

const workspace = fs.readFileSync("components/chat/ChatWorkspace.js", "utf8");
for (const token of ["resolveUnauthenticatedState", "writeLastAuthScope", "clearLastAuthScope", "authStatus", "登录会话已过期"]) {
  assert.match(workspace, new RegExp(token), `聊天页缺少会话过期处理：${token}`);
}
assert.match(workspace, /if \(!currentUser && !currentGuest\) return <div className=\{styles\.authGate\}/, "未登录时必须只渲染登录界面");
assert.doesNotMatch(workspace, /if \(authRequired && !currentUser\) return <div className=\{styles\.authGate\}/, "聊天正文不能依赖可选的 authRequired 开关保护");
assert.match(workspace, /window\.location\.replace\([^\n]*\/login\?returnTo=/, "未登录访问聊天页必须跳转到实际登录界面");
assert.match(workspace, /if \(authLoading \|\| \(!currentUser && !currentGuest\) \|\| !storageScope\) return;/, "未登录时不能水合本机聊天正文到页面状态");
assert.doesNotMatch(workspace, /if \(currentUser \|\| !storageReady \|\| !storageScope \|\| !activeBrother\?\.id\) return;/, "未登录时不能恢复候选内容到聊天状态");
assert.match(workspace, /const PERSONAL_CHAT_ROLES = new Set\(\["anchor", "operator", "super_admin"\]\)/, "主播、运营和最高管理应使用各自独立的个人聊天工作区");
assert.match(workspace, /\/api\/auth\/guest-me\//, "聊天页应优先恢复手机号游客会话");
assert.match(workspace, /guest:\$\{guest\.id\}/, "游客聊天必须按 guest id 隔离本地命名空间");
assert.match(workspace, /const canUseLocalWorkspace = canUsePersonalChat \|\| isGuest/, "游客只能使用本地临时工作台");
assert.match(workspace, /进入运营后台/, "管理账号应保留进入运营后台的入口");
assert.doesNotMatch(workspace, /if \(currentUser\?\.role !== "anchor"\) return <div className=\{styles\.authGate\}/, "运营和管理账号不应被错误拦截在主播聊天工作台之外");
assert.match(workspace, /const scope = currentUser\.role === "anchor" \? "managed" : "personal"/, "服务端聊天对象列表必须按角色选择管理或个人作用域");
assert.match(workspace, /setSnapshot\(saved\)/, "切换账号时必须从当前账号命名空间恢复会话快照");
assert.match(workspace, /const healthResponse[\s\S]*?Health is optional metadata/, "健康检查失败不能清掉已确认的认证身份");

console.log("test-chat-auth-state: ok");
