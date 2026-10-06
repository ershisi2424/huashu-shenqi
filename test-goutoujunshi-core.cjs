/* eslint-disable */
const fs = require("fs");
const vm = require("vm");

function assert(value, message) {
  if (!value) throw new Error(message);
}

const source = fs.readFileSync(__dirname + "/lib/goutoujunshi-core.js", "utf8")
  .replace(/^export const /gm, "const ")
  .replace(/^export function /gm, "function ");
const context = { Array, Object, String, Number, RegExp, Math, Set, Map, JSON };
vm.createContext(context);
vm.runInContext(`${source}\nglobalThis.api={GOUTOUJUNSHI_CORE, analyzeGoutoujunshi};`, context);

assert(context.api.GOUTOUJUNSHI_CORE.name === "goutoujunshi", "必须声明 goutoujunshi 核心算法身份");
assert(context.api.GOUTOUJUNSHI_CORE.source.includes("github.com/shengjidaguai-china/goutoujunshi"), "必须记录上游仓库来源");
assert(/^[0-9a-f]{40}$/.test(context.api.GOUTOUJUNSHI_CORE.revision), "必须锁定上游源码 revision");

const state = context.api.analyzeGoutoujunshi({
  currentMessage: "今天被老板骂了，真的很累",
  history: [{ msg: "昨天加班", reply: "今天好点了吗" }],
  sources: { works: "偶尔分享工作和生活", comments: "谢谢关心", statements: "最近在忙项目" },
});

assert(state.primaryGoal === "承接", "goutoujunshi 核心应先判断当前唯一主目标");
assert(state.workflow.join("→").includes("情绪落地→事实拆分→利益判断→明确建议→行动收束"), "必须保留上游核心分析顺序");
assert(state.evidence.some(item => item.source === "current_message"), "核心分析必须保留当前消息证据");
assert(Array.isArray(state.algorithmCore.selectedReferences) && state.algorithmCore.selectedReferences.length > 0, "必须按场景选择上游参考资料");
assert(state.algorithmCore.selectedReferences.some(path => path.includes("实战话术编排器")), "回复场景必须路由到上游话术编排器");
assert(state.decision && state.decision.action && state.decision.stopCondition, "核心算法必须输出动作与停止条件供 AI 遵循");

console.log("✅ goutoujunshi 上游核心算法适配层测试通过");
