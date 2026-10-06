import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const ROUTES = {
  evidence: "references/knowledge/01-证据分级与内容边界.md",
  reply: "references/practical/实战话术编排器：从一句回复到后续分支.md",
  emotion: "references/knowledge/03-依恋理论与情绪调节.md",
  online: "references/knowledge/09-在线约会与数字关系.md",
  conflict: "references/knowledge/07-沟通冲突与修复.md",
  consent: "references/knowledge/08-同意边界性与亲密.md",
  money: "references/knowledge/12-金钱家务育儿与双方家庭.md",
  crisis: "references/knowledge/17-中国法律安全与危机转介.md",
  mbti: "references/knowledge/04-MBTI人格与匹配.md",
  invitation: "references/practical/主动表达、第一次见面与自然接触.md",
  imbalance: "references/practical/关系投入失衡：互惠判断、降级投入与退出决策.md",
  classic: "references/knowledge/20-经典社交体系的机制、证据与风险边界.md",
};

const REASONS = {
  evidence: "上游默认证据边界",
  reply: "上游默认回复与后续分支编排",
  emotion: "当前消息包含明显情绪信号",
  online: "聊天媒介、隐私或数字关系场景",
  conflict: "当前消息涉及澄清、误会或冲突修复",
  consent: "当前消息涉及同意或亲密边界",
  money: "当前消息涉及礼物、金钱或转账边界",
  crisis: "当前消息命中威胁、自伤或现实安全风险",
  mbti: "主播明确提供了 MBTI 资料，仅作为低权重沟通偏好参考",
  invitation: "当前主目标是低压力邀约或自然接触",
  imbalance: "历史信号提示可能存在投入失衡",
  classic: "当前问题涉及经典社交策略的伦理转译",
};

const ALLOWLIST = new Set(Object.values(ROUTES));

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function routeKeys({ message = "", risk = {}, primaryGoal = "承接" } = {}) {
  const text = typeof message === "string" ? message : "";
  const types = Array.isArray(risk?.types) ? risk.types : [];
  const keys = [];
  if (types.includes("self_harm") || types.includes("threat")) keys.push("crisis");
  else if (types.includes("money") || /礼物|嘉年华|红包|转账|打钱|借钱|刷/.test(text)) keys.push("money");
  else if (types.includes("sexual_or_privacy") || /私照|裸聊|约炮|开房|住址|手机号|联系方式|曝光/.test(text)) keys.push("online");
  else if (/冷淡|不回|敷衍|单方面|取消/.test(text)) keys.push("imbalance");
  else if (primaryGoal === "约见") keys.push("invitation");
  else if (primaryGoal === "澄清" || primaryGoal === "修复" || /为什么|怎么回事|误会|不理|拉黑/.test(text)) keys.push("conflict");
  else if (/依恋|焦虑|难过|压力|难受|失眠|不想干/.test(text)) keys.push("emotion");
  return keys;
}

function readReference(relativePath) {
  if (!ALLOWLIST.has(relativePath)) {
    const error = new Error(`不允许加载上游参考资料：${relativePath}`);
    error.code = "RUNTIME_REFERENCE_NOT_ALLOWED";
    throw error;
  }
  const root = path.resolve(process.cwd(), "vendor", "goutoujunshi");
  const absolutePath = path.resolve(root, relativePath);
  if (!absolutePath.startsWith(`${root}${path.sep}`)) {
    const error = new Error("上游参考资料路径越界");
    error.code = "RUNTIME_REFERENCE_NOT_ALLOWED";
    throw error;
  }
  let contents;
  try {
    contents = fs.readFileSync(absolutePath, "utf8");
  } catch {
    const error = new Error(`上游参考资料不可用：${relativePath}`);
    error.code = "RUNTIME_REFERENCE_UNAVAILABLE";
    throw error;
  }
  const algorithmOnly = relativePath.includes("实战话术编排器")
    ? contents.split("## 常用话术库")[0]
    : contents;
  return {
    path: relativePath,
    sha256: createHash("sha256").update(contents, "utf8").digest("hex"),
    excerpt: algorithmOnly.slice(0, 2800),
  };
}

export function loadRuntimeReferences({ message = "", risk = {}, primaryGoal = "承接", selectedReferences = [] } = {}) {
  const explicit = Array.isArray(selectedReferences) && selectedReferences.length;
  const keys = explicit
    ? selectedReferences.slice(0, 3).map((relativePath) => {
        if (!ALLOWLIST.has(relativePath)) {
          const error = new Error(`不允许加载上游参考资料：${relativePath}`);
          error.code = "RUNTIME_REFERENCE_NOT_ALLOWED";
          throw error;
        }
        return Object.keys(ROUTES).find((key) => ROUTES[key] === relativePath) || "";
      })
    : unique(["evidence", "reply", ...routeKeys({ message, risk, primaryGoal })]).slice(0, 3);
  const safeKeys = unique(keys).filter(Boolean).slice(0, 3);
  const items = safeKeys.map((key) => ({
    ...readReference(ROUTES[key]),
    reason: REASONS[key],
  }));
  return {
    topics: safeKeys.filter((key) => !["evidence", "reply"].includes(key)),
    items,
    text: items.map((item) => `【${item.path} · 上游原文摘录】\n${item.excerpt}`).join("\n\n"),
  };
}

export { ROUTES, ALLOWLIST };
