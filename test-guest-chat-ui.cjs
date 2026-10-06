const assert = require("node:assert/strict");
const fs = require("node:fs");

const login = fs.readFileSync("components/auth/LoginWorkspace.js", "utf8");
const chat = fs.readFileSync("components/chat/ChatWorkspace.js", "utf8");
const profile = fs.readFileSync("pages/api/profile.js", "utf8");
const authSession = fs.readFileSync("lib/auth-session.cjs", "utf8");
const localStore = fs.readFileSync("lib/chat-local-store.cjs", "utf8");

assert.match(login, /游客试用/);
assert.match(login, /\/api\/auth\/guest-login\//);
assert.match(login, /JSON\.stringify\(isGuest \? \{ phone \}/, "游客登录只提交手机号");
assert.match(login, /returnTo.*startsWith\("\/"\)/, "游客登录必须沿用安全 returnTo 校验");
assert.match(login, /临时数据.*24 小时/);

assert.match(chat, /\/api\/auth\/guest-me\//);
assert.match(chat, /currentGuest, setCurrentGuest/);
assert.match(chat, /const isGuest = Boolean\(!currentUser && currentGuest\?\.id\)/);
assert.match(chat, /const canUseLocalWorkspace = canUsePersonalChat \|\| isGuest/);
assert.match(chat, /guest:\$\{guest\.id\}/);
assert.match(chat, /if \(isGuest\)/, "游客候选必须走本地保存分支");
assert.match(chat, /writeReplyHistory/);
assert.match(chat, /clearChatSessionSnapshot/);
assert.match(chat, /replyHistoryStorageKey/);
assert.match(chat, /if \(isGuest && storageScope\)/, "游客退出必须清理当前 guest 命名空间");
assert.doesNotMatch(chat, /PERSONAL_CHAT_ROLES = new Set\(\[.*guest/);
assert.match(chat, /const scopedBrotherId = currentUser \? await ensureServerBrother\(activeBrother\) : ""/);
assert.match(chat, /sourceMessageId: currentUser \? targetMessage\.id : ""/);
assert.match(chat, /currentGuest\.name/, "游客应显示临时工作台身份并可退出");

assert.match(profile, /getCurrentGuest/);
assert.match(profile, /cleanupGuestData/);
assert.match(profile, /setGuestSessionCookie/);
assert.match(profile, /GUEST_SCOPE_FORBIDDEN/);
assert.match(profile, /body\.brotherId \|\| body\.sourceMessageId \|\| body\.maintenanceTask/);
assert.match(profile, /activeGuest\?\.id/);
assert.match(profile, /actor\.role/);

assert.match(authSession, /try \{ return decodeURIComponent\(match\[1\]\); \} catch \{ return ""; \}/g);
assert.match(localStore, /REPLY_HISTORY_PREFIX/);
assert.match(localStore, /function readReplyHistory/);
assert.match(localStore, /function writeReplyHistory/);

console.log("test-guest-chat-ui: ok");
