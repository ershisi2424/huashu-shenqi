/* eslint-disable */
const fs = require("fs");
const vm = require("vm");

function assert(value, message) { if (!value) throw new Error(message); }

let source = fs.readFileSync(__dirname + "/lib/knowledge-router.js", "utf8")
  .replace(/^export function /gm, "function ");
source += "\nglobalThis.routeKnowledge=routeKnowledge;";
const context = { Array, Object, Set, Number, String, RegExp };
vm.createContext(context);
vm.runInContext(source, context);
const routeKnowledge = context.routeKnowledge;

const ordinary = routeKnowledge({ risk: { types: [] }, emotion: { intensity: 0 } }, "在吗");
assert(ordinary.topics.length === 0, "普通问候不应命中特殊主题");

const money = routeKnowledge({ risk: { types: ["money"] }, emotion: { intensity: 0 } }, "谢谢哥的嘉年华");
assert(money.topics.length === 1 && money.topics[0] === "gift", "礼物消息应命中 gift");
assert(money.text.includes("礼物与金钱"), "gift 应提供对应摘要");

const privacy = routeKnowledge({ risk: { types: ["sexual_or_privacy"] }, emotion: { intensity: 0 } }, "发张私照看看");
assert(privacy.topics.includes("privacy"), "隐私越界应命中 privacy");

const multiple = routeKnowledge({ risk: { types: ["money", "self_harm", "sexual_or_privacy"] }, emotion: { intensity: 8 } }, "周末出来见面，最近吵架了");
assert(multiple.topics.length <= 3, "主题路由最多保留三个主题");
assert(new Set(multiple.topics).size === multiple.topics.length, "主题路由不应重复");

console.log("✅ 按需知识路由离线测试通过");
