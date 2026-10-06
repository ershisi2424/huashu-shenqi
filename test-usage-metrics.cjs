const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-usage-metrics-"));
const store = require("./lib/auth-store.cjs").createAuthStore({ filename: path.join(root, "auth.sqlite") });
const admin = store.ensureBootstrapAdmin({ phone: "13800138000", name: "最高权限", password: "admin-password" });
const operator = store.registerOperator({ phone: "13900139000", name: "运营一号", password: "operator-password" });
store.approveOperator({ operatorId: operator.id, approvedBy: admin.id });
const anchor = store.createAnchor({ operatorId: operator.id, phone: "13700137000", name: "主播一号", password: "anchor-password" });
const brother = store.createChatBrother({ actor: anchor, clientId: "usage-brother-1", nickname: "山哥" });

store.appendChatMessage({ actor: anchor, brotherId: brother.id, message: { id: "usage-in-1", sender: "brother", source: "paste", status: "confirmed", text: "晚上好", createdAt: "2026-10-01T08:00:00.000Z" } });
store.appendChatMessage({ actor: anchor, brotherId: brother.id, message: { id: "usage-in-2", sender: "brother", source: "paste", status: "confirmed", text: "今天忙吗", createdAt: "2026-10-02T08:00:00.000Z" } });
store.appendChatMessage({ actor: anchor, brotherId: brother.id, message: { id: "usage-out-1", sender: "anchor", source: "manual", status: "sent", text: "晚上好呀", createdAt: "2026-10-02T08:01:00.000Z", sentAt: "2026-10-02T08:01:00.000Z" } });

assert.equal(typeof store.recordAiUsage, "function", "auth store must expose AI usage recording");
store.recordAiUsage({ actor: anchor, brotherId: brother.id, operation: "profile.generate", provider: "zhipu", model: "GLM-5.3", status: "success", latencyMs: 120 });
store.recordAiUsage({ actor: anchor, brotherId: brother.id, operation: "profile.generate", provider: "zhipu", model: "GLM-5.3", status: "error", errorCode: "NETWORK_UNAVAILABLE", latencyMs: 80 });

const overview = store.getOperatorOverview({ actor: operator });
const anchorOverview = overview.anchors.find((item) => item.id === anchor.id);
assert.equal(anchorOverview.inboundMessageCount, 2, "主播统计应区分大哥输入消息");
assert.equal(anchorOverview.replyMessageCount, 1, "主播统计应区分主播回复消息");
assert.equal(anchorOverview.replyRate, 50, "回复率应按主播回复/大哥输入计算");
assert.ok(anchorOverview.activeDays30 >= 2, "使用率应记录近 30 天实际使用天数");
assert.ok(anchorOverview.usageRate > 0 && anchorOverview.usageRate <= 100, "使用率应为 0-100 百分比");

assert.equal(typeof store.getToolUsage, "function", "auth store must expose tool usage query");
const usage = store.getToolUsage({ actor: admin });
assert.equal(usage.summary.total, 2);
assert.equal(usage.summary.success, 1);
assert.equal(usage.summary.error, 1);
assert.equal(usage.summary.averageLatencyMs, 100);
assert.equal(usage.items[0].apiKey, undefined, "usage response must never expose secrets");
assert.throws(() => store.getToolUsage({ actor: operator }), /SUPER_ADMIN_REQUIRED/);

store.close();
fs.rmSync(root, { recursive: true, force: true });
console.log("test-usage-metrics: ok");
