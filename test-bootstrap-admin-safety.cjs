const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-bootstrap-admin-"));
const store = require("./lib/auth-store.cjs").createAuthStore({ filename: path.join(root, "auth.sqlite") });
try {
  const first = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
  const repeated = store.ensureBootstrapAdmin({ phone: "13800138000", name: "不能覆盖", password: "another-password" });
  assert.equal(repeated.id, first.id, "同一管理员初始化应保持幂等");
  assert.equal(store.authenticate("13800138000", "admin-password").id, first.id);
  assert.throws(
    () => store.ensureBootstrapAdmin({ phone: "13800138001", name: "第二管理员", password: "admin-password-2" }),
    /BOOTSTRAP_ADMIN_EXISTS/,
    "已有活动最高管理员时不得静默创建第二个最高管理员",
  );
  const operator = store.registerOperator({ phone: "13900139000", name: "运营申请", password: "operator-password" });
  assert.throws(
    () => store.ensureBootstrapAdmin({ phone: operator.phone, name: "冒用手机号", password: "admin-password" }),
    /BOOTSTRAP_PHONE_CONFLICT/,
    "已有非最高管理员手机号不得被初始化脚本提升",
  );
  assert.equal(operator.role, "operator");
  console.log("test-bootstrap-admin-safety: ok");
} finally {
  store.close();
  fs.rmSync(root, { recursive: true, force: true });
}
