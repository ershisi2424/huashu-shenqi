const assert = require("node:assert/strict");
const fs = require("node:fs");

const component = fs.readFileSync("components/chat/ChatWorkspace.js", "utf8");
const localStore = fs.readFileSync("lib/chat-local-store.cjs", "utf8");

assert.match(component, /saveReplyHistory\s*=\s*async\s*\(\{[\s\S]*runtimeAnalysis/);
assert.match(component, /body:\s*JSON\.stringify\(\{[\s\S]*runtimeAnalysis:\s*historyRuntimeAnalysis/);
assert.match(component, /const localItem = \{[\s\S]*runtimeAnalysis:\s*candidateRuntimeAnalysis/);
assert.match(component, /setRuntimeAnalysis\(item\.runtimeAnalysis/);
assert.match(component, /setRuntimeIntake\(item\.runtimeIntake/);
assert.match(component, /setRuntimeMeta\(item\.runtime/);
assert.match(component, /setOpeningTopics\(Array\.isArray\(item\.openingTopics\)/);
assert.match(component, /setLiveInvite\(item\.liveInvite/);
assert.match(component, /const restoreReplyHistory = \(item\) => \{[\s\S]*invalidateGeneration\(\);/);
assert.match(localStore, /function normalizeReplyHistory\(/);
assert.match(localStore, /runtimeAnalysis/);
assert.match(localStore, /openingTopics/);

console.log("test-chat-reply-history-runtime-ui: ok");
