const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createSetupState } = require("./lib/setup-state.cjs");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-setup-state-"));
try {
  let current = 1000;
  const state = createSetupState({ filePath: path.join(root, "setup.json"), now: () => current });
  const issued = state.issue();
  assert.equal(typeof issued.code, "string");
  assert.equal(issued.code.length >= 20, true);
  assert.equal(state.verify(issued.code, current), true);
  assert.equal(state.verify(issued.code, current), false, "初始化码只能使用一次");

  const expired = state.issue();
  current += 15 * 60 * 1000 + 1;
  assert.equal(state.verify(expired.code, current), false, "初始化码过期后必须拒绝");

  current += 1;
  const locked = state.issue();
  for (let attempt = 0; attempt < 5; attempt += 1) assert.equal(state.verify("wrong-code", current), false);
  assert.equal(state.status(current).locked, true);
  assert.equal(state.verify(locked.code, current), false, "失败次数达到上限后不得继续尝试");

  const persisted = createSetupState({ filePath: path.join(root, "setup.json"), now: () => current });
  assert.equal(persisted.status(current).locked, true);
  console.log("test-setup-state: ok");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
