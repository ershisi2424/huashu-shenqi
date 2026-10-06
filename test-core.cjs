/* eslint-disable */
const fs = require("fs");
const vm = require("vm");

function assert(value, message) {
  if (!value) throw new Error(message);
}

// 核心生成器：在 VM 中注入模板数据，不依赖浏览器。
const data = fs.readFileSync(__dirname + "/data/scripts.json", "utf8");
let generator = fs.readFileSync(__dirname + "/lib/generator.js", "utf8")
  .replace(/^import scriptData[^;]+;$/m, "")
  .replace(/^export function /gm, "function ")
  .replace(/^export \{[^}]+\};?$/gm, "");
generator = `const scriptData = ${data};\n${generator}\nglobalThis.api={analyzeBrotherQuote,generateOnePerPersonality,applyEngagementSafety};`;
const generatorContext = { console, Math, Date, JSON, Array, Object, String, Number, RegExp, Map, Set };
vm.createContext(generatorContext);
vm.runInContext(generator, generatorContext, { timeout: 30_000 });

const emotional = generatorContext.api.analyzeBrotherQuote("我爱你，但我真的绝望了", {});
assert(emotional.toneLevel === -2, "严重负面情绪应优先于热情词");
const crossLine = generatorContext.api.analyzeBrotherQuote("能借我3万块吗", { intensity: "heatup" });
assert(crossLine.crossLine && crossLine.suggestIntensity === "warmup", "越界场景不得手动升温");
assert(generatorContext.api.generateOnePerPersonality("今天加班好累", {}).length === 8, "应生成 8 种性格回复");
const safeText = generatorContext.api.applyEngagementSafety("你随时找我 我永远在，下次记得继续刷礼物");
assert(!/永远在|刷礼物/.test(safeText), "应去除虚假陪伴和刷礼诱导");

// 旧档案迁移：同昵称合并，会话去重且保留新快照。
let storage = fs.readFileSync(__dirname + "/lib/brother-storage.js", "utf8")
  .replace("export function normalizeBrothers", "function normalizeBrothers");
storage += "\nglobalThis.normalizeBrothers=normalizeBrothers;";
const storageContext = { Map, Array, Object };
vm.createContext(storageContext);
vm.runInContext(storage, storageContext);
const profiles = storageContext.normalizeBrothers([
  { id: "old", nickname: "陈哥", brotherMessage: "旧消息", sessions: [{ id: "s1", ts: 1 }] },
  { id: "new", nickname: "陈哥", brotherMessage: "新消息", sessions: [{ id: "s2", ts: 2 }, { id: "s1", ts: 1 }] },
]);
assert(profiles.length === 1, "同昵称旧档案应合并");
assert(profiles[0].sessions.length === 2, "历史会话应去重保留");
assert(profiles[0].brotherMessage === "新消息", "应保留最新快照");

// 关系状态适配层：先写期望，再实现生产模块（TDD RED 阶段）
let relationship = fs.readFileSync(__dirname + "/lib/relationship-engine.js", "utf8")
  .replace(/^export function /gm, "function ")
  .replace(/^export \{[^}]+\};?$/gm, "");
relationship += "\nglobalThis.deriveRelationshipState=deriveRelationshipState;";
const relationshipContext = { Array, Object, String, Number, RegExp, Math, Set, Map };
vm.createContext(relationshipContext);
vm.runInContext(relationship, relationshipContext);
const deriveRelationshipState = relationshipContext.deriveRelationshipState;

const financialState = deriveRelationshipState({ currentMessage: "能借我3万块吗 周转不开" });
assert(financialState.risk.level === "high", "借钱请求应识别为高风险");
assert(financialState.primaryGoal === "收线", "借钱请求应优先收线和设边界");

const emotionalState = deriveRelationshipState({ currentMessage: "今天被老板骂了 真不想干了" });
assert(emotionalState.emotion.intensity >= 5, "负面情绪应保留足够强度");
assert(emotionalState.primaryGoal === "承接", "负面情绪应优先承接");

const unknownState = deriveRelationshipState({ currentMessage: "在吗" });
assert(unknownState.familiarity === "初识", "没有历史时应标记为初识");
assert(unknownState.unknowns.length > 0, "信息不足时应明确记录未知项");

const historyState = deriveRelationshipState({
  currentMessage: "最近工作还顺利吗",
  history: [
    { msg: "昨天加班了", reply: "今天好点了吗" },
    { msg: "周末去钓鱼", reply: "下次分享照片" },
    { msg: "刚下播", reply: "辛苦啦" },
  ],
});
assert(historyState.familiarity === "熟悉", "多轮历史应识别为熟悉关系");
assert(historyState.reciprocity.some(item => item.direction === "positive"), "有来有回的历史应生成正向互惠信号");

console.log("✅ 核心规则、安全策略和档案迁移测试通过");
