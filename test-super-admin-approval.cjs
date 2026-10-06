const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createAuthStore } = require("./lib/auth-store.cjs");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-super-approval-"));
const store = createAuthStore({ filename: path.join(root, "auth.sqlite") });
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
const operatorA = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password" });
const operatorB = store.registerOperator({ phone: "13600136000", name: "运营二号", password: "operator-password-2" });
store.approveOperator({ operatorId: operatorA.id, approvedBy: admin.id });
store.approveOperator({ operatorId: operatorB.id, approvedBy: admin.id });
const pendingA = store.registerAnchorApplication({ operatorId: operatorA.id, phone: "13700137000", name: "主播一号", password: "anchor-password" });
const pendingB = store.registerAnchorApplication({ operatorId: operatorB.id, phone: "13500135000", name: "主播二号", password: "anchor-password-2" });

const allForAdmin = store.listPendingAnchorsForApprover(admin.id);
assert.equal(allForAdmin.length, 2, "最高管理员应看到全部运营名下的主播申请");
assert.deepEqual(new Set(allForAdmin.map((item) => item.id)), new Set([pendingA.id, pendingB.id]));

const approved = store.approveAnchor({ anchorId: pendingA.id, approvedBy: admin.id });
assert.equal(approved.status, "active");
assert.equal(approved.operatorId, operatorA.id, "最高管理员审批不能改变主播绑定的运营");
const rejected = store.rejectAnchor({ anchorId: pendingB.id, approvedBy: admin.id });
assert.equal(rejected.status, "disabled");

const operatorScoped = store.listPendingAnchorsForApprover(operatorA.id);
assert.equal(operatorScoped.length, 0, "运营不能再看到已处理申请");
assert.throws(() => store.approveAnchor({ anchorId: pendingB.id, approvedBy: operatorA.id }), /ANCHOR_NOT_PENDING/);

store.close();
fs.rmSync(root, { recursive: true, force: true });
console.log("test-super-admin-approval: ok");
