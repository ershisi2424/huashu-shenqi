const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-anchor-registration-"));
const store = require("./lib/auth-store.cjs").createAuthStore({ filename: path.join(root, "auth.sqlite") });
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
const operator = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password" });
store.approveOperator({ operatorId: operator.id, approvedBy: admin.id });
const secondOperatorPending = store.registerOperator({ phone: "13900139001", name: "运营二号", password: "operator-password" });
store.approveOperator({ operatorId: secondOperatorPending.id, approvedBy: admin.id });

const listedOperators = store.listActiveOperators();
assert.equal(listedOperators.length, 2);
assert.ok(listedOperators.every((item) => item.status === "active"));
assert.ok(listedOperators.every((item) => item.phone.includes("****") && !item.phone.includes("13900139000")));
assert.ok(listedOperators.every((item) => !Object.hasOwn(item, "passwordHash")));

const pendingAnchor = store.registerAnchorApplication({
  operatorId: operator.id,
  phone: "13700137000",
  name: "主播一号",
  password: "anchor-password",
});
assert.equal(pendingAnchor.role, "anchor");
assert.equal(pendingAnchor.status, "pending");
assert.equal(pendingAnchor.operatorId, operator.id);
assert.equal(store.authenticate("13700137000", "anchor-password"), null);
assert.equal(store.listPendingAnchorsForOperator(operator.id).length, 1);

assert.throws(
  () => store.approveAnchor({ anchorId: pendingAnchor.id, approvedBy: secondOperatorPending.id }),
  /ANCHOR_APPROVAL_FORBIDDEN/,
);
const approvedAnchor = store.approveAnchor({ anchorId: pendingAnchor.id, approvedBy: operator.id });
assert.equal(approvedAnchor.status, "active");
assert.equal(store.authenticate("13700137000", "anchor-password").id, pendingAnchor.id);
assert.throws(
  () => store.approveAnchor({ anchorId: pendingAnchor.id, approvedBy: operator.id }),
  /ANCHOR_NOT_PENDING/,
);

store.close();
fs.rmSync(root, { recursive: true, force: true });
console.log("test-anchor-registration: ok");
