/* eslint-disable */
const fs = require("fs");
const vm = require("vm");

function assert(value, message) { if (!value) throw new Error(message); }

let source = fs.readFileSync(__dirname + "/lib/request-budget.js", "utf8")
  .replace(/^export function /gm, "function ");
source += "\nglobalThis.estimateProfileRequest=estimateProfileRequest;";
const context = { JSON, Math, Array, String, Number };
vm.createContext(context);
vm.runInContext(source, context);
const estimate = context.estimateProfileRequest;

const empty = estimate({ currentMessage: "在吗", replyCount: 8 });
assert(empty.replyCount === 8, "直接原创模式应返回 8 条回复预算");
assert(empty.sourceChars === 0, "没有画像素材时素材字符数应为 0");
assert(empty.approxInputTokens > 0, "请求仍应包含当前消息和关系状态估算");

const full = estimate({
  currentMessage: "今天辛苦了",
  works: "作品文案".repeat(20),
  comments: "评论".repeat(10),
  statements: "公开发言".repeat(5),
  history: [{ msg: "昨天加班", reply: "今天好点了吗" }],
  replyCount: 6,
  relationshipState: { facts: ["对方当前发言：今天辛苦了"] },
});
assert(full.replyCount === 6, "应统计原创回复数量");
assert(full.historyCount === 1, "应统计历史数量");
assert(full.sourceChars > 0, "应统计画像素材字符数");
assert(full.approxInputTokens < full.serializedChars, "近似 Token 数不应大于 JSON 字符数");
assert(!Object.hasOwn(full, "material"), "预算结果不应返回原始请求材料");

console.log("✅ 智谱 GLM-5.3 请求预算离线测试通过");
