const assert = require("node:assert/strict");
const fs = require("node:fs");
const source = fs.readFileSync("components/chat/ChatWorkspace.js", "utf8");
const localStore = fs.readFileSync("lib/chat-local-store.cjs", "utf8");
for (const token of ["chatStorageKey", "memoryEnabledKey", "storageScope", "workspaceTouchedRef", "replyHistory"]) {
  assert.ok(source.includes(token) || localStore.includes(token), `主播隔离实现应包含 ${token}`);
}
assert.match(source, /setWorkspaceTouched|workspaceRequestToken/);
assert.match(source, /api\/chat\/reply-history/);
assert.match(source, /回复历史/);
console.log("test-chat-anchor-isolation: ok");
