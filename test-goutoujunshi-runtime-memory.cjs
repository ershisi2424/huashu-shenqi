/* eslint-disable */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createAuthStore } = require("./lib/auth-store.cjs");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "goutou-runtime-memory-"));
const store = createAuthStore({ filename: path.join(root, "auth.sqlite") });

function activeAnchor(phone, name, operator, admin) {
  return store.createAnchor({ operatorId: operator.id, phone, name, password: "anchor-password" });
}

(async () => {
  const { memoryNamespace, normalizeMemoryCommand, buildMemoryContext } = await import("./lib/goutoujunshi-runtime/memory.js");
  const admin = store.ensureBootstrapAdmin({ phone: "13800000001", name: "最高权限", password: "admin-password" });
  const operatorPending = store.registerOperator({ phone: "13900000001", name: "运营一号", password: "operator-password" });
  const operator = store.approveOperator({ operatorId: operatorPending.id, approvedBy: admin.id });
  const anchor = activeAnchor("13700000001", "主播一号", operator, admin);
  const otherAnchor = activeAnchor("13700000002", "主播二号", operator, admin);
  const brother = store.createChatBrother({ actor: anchor, clientId: "same-client", nickname: "同名大哥" });
  const otherBrother = store.createChatBrother({ actor: otherAnchor, clientId: "same-client", nickname: "同名大哥" });

  assert.notEqual(memoryNamespace(anchor.id, brother.id), memoryNamespace(otherAnchor.id, otherBrother.id));
  assert.equal(normalizeMemoryCommand({ action: "status", brotherId: brother.id }).action, "status");
  assert.deepEqual(buildMemoryContext([]), []);

  const initial = store.getRuntimeMemoryStatus({ actor: anchor, brotherId: brother.id });
  assert.equal(initial.consentEnabled, false);
  assert.throws(() => store.applyRuntimeMemoryDelta({
    actor: anchor,
    brotherId: brother.id,
    delta: { scope: "object", field: "interest", value: "钓鱼", sourceType: "user_explicit", confidence: "high" },
  }), (error) => error.message === "CONSENT_REQUIRED");

  store.enableRuntimeMemory({ actor: anchor, brotherId: brother.id });
  const saved = store.applyRuntimeMemoryDelta({
    actor: anchor,
    brotherId: brother.id,
    delta: { scope: "object", field: "interest", value: "钓鱼", sourceType: "user_explicit", confidence: "high", sourceRef: "主播确认" },
  });
  assert.equal(saved.field, "interest");
  assert.equal(store.listRuntimeMemory({ actor: anchor, brotherId: brother.id }).items.length, 1);
  assert.throws(() => store.applyRuntimeMemoryDelta({
    actor: anchor,
    brotherId: brother.id,
    delta: { scope: "object", field: "type", value: "回避型", sourceType: "assistant_inference", confidence: "low" },
  }), (error) => error.message === "SOURCE_NOT_ELIGIBLE");
  const hypothesis = store.applyRuntimeMemoryDelta({
    actor: anchor,
    brotherId: brother.id,
    delta: { scope: "hypothesis", field: "topic", value: "可能喜欢户外", sourceType: "assistant_inference", confidence: "low" },
  });
  assert.equal(hypothesis.scope, "hypothesis");

  store.pauseRuntimeMemory({ actor: anchor, brotherId: brother.id });
  assert.throws(() => store.applyRuntimeMemoryDelta({
    actor: anchor,
    brotherId: brother.id,
    delta: { scope: "event", field: "note", value: "暂停期间不应写入", sourceType: "user_explicit", confidence: "medium" },
  }), (error) => error.message === "MEMORY_PAUSED");
  store.resumeRuntimeMemory({ actor: anchor, brotherId: brother.id });
  assert.ok(store.undoRuntimeMemory({ actor: anchor, brotherId: brother.id }));
  assert.equal(store.listRuntimeMemory({ actor: anchor, brotherId: brother.id }).items.length, 1);
  store.forgetRuntimeMemoryObject({ actor: anchor, brotherId: brother.id });
  assert.equal(store.listRuntimeMemory({ actor: anchor, brotherId: brother.id }).items.length, 0);
  store.revokeRuntimeMemory({ actor: anchor, brotherId: brother.id });
  assert.equal(store.getRuntimeMemoryStatus({ actor: anchor, brotherId: brother.id }).consentEnabled, false);
  assert.throws(() => store.listRuntimeMemory({ actor: otherAnchor, brotherId: brother.id }), (error) => error.message === "CHAT_ACCESS_DENIED");

  store.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log("✅ goutoujunshi runtime memory contract passed");
})().catch((error) => {
  try { store.close(); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
  console.error(error);
  process.exitCode = 1;
});
