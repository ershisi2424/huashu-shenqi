import { routeKnowledge } from "../../lib/knowledge-router";
import { analyzeGoutoujunshi, GOUTOUJUNSHI_CORE } from "../../lib/goutoujunshi-core";
import { analyzeGoutoujunshiRuntime } from "../../lib/goutoujunshi-runtime/index.js";
import { validateGenerationAgainstRuntime } from "../../lib/goutoujunshi-runtime/contract.js";
import { authRequired, clearGuestSessionCookie, getCurrentGuest, getCurrentUser, getAuthStore, readGuestSessionToken, setGuestSessionCookie, setPrivateNoStore } from "../../lib/auth-session.cjs";
import { callChatCompletion, ProviderRequestError } from "../../lib/ai-provider.cjs";
import { normalizeReplyStyle, replyStyleInstruction } from "../../lib/reply-style.cjs";
import fs from "node:fs";
import path from "node:path";

// 服务端 AI 链路说明：此路由是唯一的 GLM-5.3 生成入口。
// 顺序必须保持为：认证/作用域校验 → 输入清洗 → goutoujunshi Runtime
// → 服务端 promptContext → 智谱调用 → Runtime 契约校验 → 返回候选。
// 浏览器不能提交历史记录来覆盖服务端已确认的消息，也不能绕过最终校验。

const WINDOW_MS = Math.max(60_000, Number.parseInt(process.env.PROFILE_RATE_LIMIT_WINDOW_MS, 10) || 10 * 60 * 1000);
const MAX_REQUESTS = Math.max(1, Number.parseInt(process.env.PROFILE_RATE_LIMIT_MAX, 10) || 60);
const requestBuckets = new Map();
const GOUTOUJUNSHI_REFERENCE_ALLOWLIST = new Set([
  "references/knowledge/01-证据分级与内容边界.md",
  "references/knowledge/03-依恋理论与情绪调节.md",
  "references/knowledge/07-沟通冲突与修复.md",
  "references/knowledge/08-同意边界性与亲密.md",
  "references/knowledge/09-在线约会与数字关系.md",
  "references/knowledge/12-金钱家务育儿与双方家庭.md",
  "references/knowledge/17-中国法律安全与危机转介.md",
  "references/practical/实战话术编排器：从一句回复到后续分支.md",
  "references/practical/主动表达、第一次见面与自然接触.md",
  "references/practical/关系投入失衡：互惠判断、降级投入与退出决策.md",
]);

function recordUsageSafely({ actor, brotherId, operation = "profile.generate", status = "success", errorCode = "", model = "", latencyMs = null } = {}) {
  if (!actor || !["anchor", "operator", "super_admin"].includes(actor.role) || typeof getAuthStore !== "function") return;
  try {
    getAuthStore().recordAiUsage({ actor, brotherId, operation, provider: "zhipu", model, status, errorCode, latencyMs });
  } catch (error) {
    // Metrics must never make an otherwise valid AI response fail.
    console.error("AI usage metric failed", error?.message || "Error");
  }
}

function loadGoutoujunshiReferences(selectedReferences) {
  const references = Array.isArray(selectedReferences) ? selectedReferences.slice(0, 3) : [];
  if (!references.length) throw new Error("MISSING_GOUTOUJUNSHI_REFERENCES");
  return references.map((relativePath) => {
    if (!GOUTOUJUNSHI_REFERENCE_ALLOWLIST.has(relativePath)) throw new Error("INVALID_GOUTOUJUNSHI_REFERENCE");
    const absolutePath = path.join(process.cwd(), "vendor", "goutoujunshi", relativePath);
    const contents = fs.readFileSync(absolutePath, "utf8");
    // The generation flow is before the fixed phrase library. Keep the
    // original algorithm text, but never inject the upstream phrase examples.
    const algorithmOnly = relativePath.includes("实战话术编排器")
      ? contents.split("## 常用话术库")[0]
      : contents;
    return `【${relativePath} · 上游原文摘录】\n${algorithmOnly.slice(0, 2800)}`;
  }).join("\n\n");
}

const MAINTENANCE_PRINCIPLES = `
【主播私聊维护原则】
1. 核心关系：把对方当作值得尊重的熟客或朋友交流。真诚、轻松、有分寸，比夸张热情和套路更重要；主播保留自己的生活、隐私、节奏和原则。
2. 具体关心：优先回应对方这句话里的具体事情和情绪，不泛泛输出鸡汤。能接住情绪就先接住，再根据语境自然追问一句，不急着教育、诊断或解决一切。
3. 因人调整：只有素材有证据时才调整方式。偏事业和理性表达的人，使用平等、尊重、简洁的朋友式交流，可聊工作或兴趣但不盘问；偏情感表达的人，可以多倾听和回应感受，但不制造唯一感、秘密同盟或依赖。
4. 因熟悉度调整：刚认识时礼貌轻松，问宽松的兴趣问题；逐渐熟悉后可引用真实聊过的小事，形成自然连续性；长期熟客重在记得细节、稳定回应和尊重边界，不执行固定天数的“升温计划”。
5. 不使用操控技巧：不故意慢回以抬高身价，不假装忙碌，不欲擒故纵，不考验对方，不刺激征服欲，不制造嫉妒、稀缺、唯一性或情感依赖，不利用压力或关系不对等推进结果。
6. 最终效果：像一个有自己生活、会认真听人说话的真人。温暖但不黏，亲近但不越界，有个性但不伤人。回复里不得提及“维护、策略、类型、情绪价值、转化、付费”等幕后概念。
`;

const PROFILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["profile", "strategy", "replies", "riskNotice"],
  properties: {
    profile: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "interests", "communicationStyle", "preferredTopics", "avoidTopics", "evidence", "confidence"],
      properties: {
        summary: { type: "string" },
        interests: { type: "array", items: { type: "string" }, maxItems: 8 },
        communicationStyle: { type: "string" },
        preferredTopics: { type: "array", items: { type: "string" }, maxItems: 8 },
        avoidTopics: { type: "array", items: { type: "string" }, maxItems: 8 },
        evidence: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["signal", "source"],
            properties: {
              signal: { type: "string" },
              source: { type: "string" },
            },
          },
        },
        confidence: { type: "integer", minimum: 0, maximum: 100 },
      },
    },
    strategy: {
      type: "object",
      additionalProperties: false,
      required: ["approach", "boundaries"],
      properties: {
        approach: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
        boundaries: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
      },
    },
    replies: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidateIndex", "style", "text", "rationale", "sendWhen", "branches", "observationWindow", "stopCondition"],
        properties: {
          candidateIndex: { type: "integer", minimum: 0, maximum: 7 },
          style: { type: "string" },
          text: { type: "string" },
          rationale: { type: "string" },
          sendWhen: { type: "string" },
          branches: {
            type: "object",
            additionalProperties: false,
            required: ["positive", "ambiguous", "refusal"],
            properties: {
              positive: { type: "string" },
              ambiguous: { type: "string" },
              refusal: { type: "string" },
            },
          },
          observationWindow: { type: "string" },
          stopCondition: { type: "string" },
        },
      },
    },
    openingTopics: { type: "array", items: { type: "string" }, maxItems: 6 },
    liveInvite: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["allowed", "text", "rationale"],
      properties: {
        allowed: { type: "boolean" },
        text: { type: "string" },
        rationale: { type: "string" },
      },
    },
    riskNotice: { type: "string" },
  },
};

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, maxLength) : "";
}

function firstRuntimeId(maxLength, ...values) {
  for (const value of values) {
    const normalized = cleanText(value, maxLength);
    if (normalized) return normalized;
  }
  return "";
}

function getClientId(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

function isRateLimited(req) {
  const now = Date.now();
  const key = getClientId(req);
  const recent = (requestBuckets.get(key) || []).filter((ts) => now - ts < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) return true;
  recent.push(now);
  requestBuckets.set(key, recent);
  return false;
}

function outputText(response) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((item) => item?.text || "").join("");
  return "";
}

function stringArray(value, maxItems = 8) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()).slice(0, maxItems) : [];
}

function normalizeAlgorithmCore(value) {
  const selectedReferences = Array.isArray(value?.selectedReferences)
    ? value.selectedReferences.filter((item) => typeof item === "string" && item.startsWith("references/")).slice(0, 3)
    : [];
  return {
    ...GOUTOUJUNSHI_CORE,
    selectedReferences,
  };
}

function normalizeDecision(value, primaryGoal = "承接") {
  return {
    action: cleanText(value?.action, 240) || `围绕“${primaryGoal}”只完成一个主要动作，不叠加追问或推进`,
    observationWindow: cleanText(value?.observationWindow, 240) || "观察对方是否提供新的具体信息，不连续补发",
    stopCondition: cleanText(value?.stopCondition, 240) || "对方明确拒绝、持续没有互惠或出现边界风险",
  };
}

function normalizeRelationshipState(value, currentMessage) {
  const state = value && typeof value === "object" ? value : {};
  const risk = state.risk && typeof state.risk === "object" ? state.risk : {};
  const emotion = state.emotion && typeof state.emotion === "object" ? state.emotion : {};
  const allowedGoals = new Set(["承接", "降压", "调侃", "轻推", "约见", "澄清", "修复", "收线"]);
  const allowedFamiliarity = new Set(["初识", "熟悉", "长期熟客", "未知"]);
  const allowedRisk = new Set(["none", "low", "medium", "high"]);
  const facts = stringArray(state.facts);
  const currentFact = cleanText(currentMessage, 800) ? `对方当前发言：${cleanText(currentMessage, 800)}` : "";
  if (currentFact && !facts.includes(currentFact)) facts.unshift(currentFact);
  return {
    facts: facts.slice(0, 8),
    inferences: stringArray(state.inferences),
    unknowns: stringArray(state.unknowns),
    evidence: Array.isArray(state.evidence)
      ? state.evidence.slice(0, 8).map((item) => ({
          source: cleanText(item?.source, 40),
          speaker: cleanText(item?.speaker, 20) || "unknown",
          text: cleanText(item?.text, 240),
          confidence: ["high", "medium", "low"].includes(item?.confidence) ? item.confidence : "low",
        })).filter((item) => item.source && item.text)
      : [],
    emotion: {
      label: cleanText(emotion.label, 40) || "未明确",
      intensity: Math.max(0, Math.min(10, Number.parseInt(emotion.intensity, 10) || 0)),
      evidence: stringArray(emotion.evidence, 6),
    },
    risk: {
      level: allowedRisk.has(risk.level) ? risk.level : "none",
      types: stringArray(risk.types, 6),
    },
    primaryGoal: allowedGoals.has(state.primaryGoal) ? state.primaryGoal : "承接",
    familiarity: allowedFamiliarity.has(state.familiarity) ? state.familiarity : "未知",
    decision: normalizeDecision(state.decision, allowedGoals.has(state.primaryGoal) ? state.primaryGoal : "承接"),
    algorithmCore: normalizeAlgorithmCore(state.algorithmCore),
    reciprocity: Array.isArray(state.reciprocity)
      ? state.reciprocity.slice(0, 6).map((item) => ({
          signal: cleanText(item?.signal, 160),
          direction: ["positive", "unclear", "negative"].includes(item?.direction) ? item.direction : "unclear",
        })).filter((item) => item.signal)
      : [],
  };
}

function normalizeReplyText(value) {
  return cleanText(value, 800).toLowerCase().replace(/[\s\u3000，。！？、,.!?…~～:：;；'"“”‘’（）()【】\[\]{}]/g, "");
}

function normalizeGenerationMode(value) {
  return value === "opening" ? "opening" : "reply";
}

function normalizeOpeningMode(value) {
  const allowed = new Set(["morning", "after_work", "continue_topic", "casual"]);
  return allowed.has(value) ? value : "casual";
}

function liveInviteStillEligible(value) {
  if (typeof value !== "string" || !value.trim()) return true;
  const last = Date.parse(value);
  return !Number.isFinite(last) || Date.now() - last >= 24 * 60 * 60 * 1000;
}

function hasLiveContentInterest(material) {
  const source = [
    material.currentMessage,
    material.works,
    material.comments,
    material.statements,
    ...material.history.flatMap((row) => [row.message, row.reply]),
  ].join(" ");
  return /直播|开播|直播间|主播|视频|作品|看你|想看/.test(source);
}

function runtimeLegacyTopics(runtimeResult, currentMessage) {
  const paths = Array.isArray(runtimeResult?.runtime?.loadedReferences)
    ? runtimeResult.runtime.loadedReferences.map((item) => item?.path || "")
    : [];
  const text = typeof currentMessage === "string" ? currentMessage : "";
  const topics = [];
  if (paths.some((path) => path.includes("12-金钱")) || /礼物|嘉年华|红包|转账|打钱|借钱|刷/.test(text)) topics.push("gift");
  if (paths.some((path) => path.includes("03-依恋") || path.includes("17-中国法律")) || Number(runtimeResult?.analysis?.emotion?.intensity) >= 5) topics.push("distress");
  if (paths.some((path) => path.includes("09-在线约会") || path.includes("08-同意")) || /私照|裸聊|约炮|开房|住址|联系方式|曝光/.test(text)) topics.push("privacy");
  if (paths.some((path) => path.includes("07-沟通冲突")) || /生气|误会|不理|拉黑|删掉|怎么回事|为什么/.test(text)) topics.push("conflict");
  if (paths.some((path) => path.includes("主动表达")) || /周末|有空|出来|见面|想见|一起吃|约你/.test(text)) topics.push("invitation");
  return [...new Set(topics)].slice(0, 3);
}

function legacyRelationshipState(analysis) {
  const state = analysis && typeof analysis === "object" ? analysis : {};
  const values = (items) => Array.isArray(items)
    ? items.map((item) => typeof item === "string" ? item : cleanText(item?.text, 240)).filter(Boolean)
    : [];
  return {
    ...state,
    facts: values(state.facts),
    inferences: values(state.inferences),
    unknowns: values(state.unknowns),
    contradictions: values(state.contradictions),
  };
}

function normalizeAIResult(value, replyCount) {
  const profile = value?.profile || {};
  const strategy = value?.strategy || {};
  const replies = Array.isArray(value?.replies) ? value.replies : [];
  const normalizedReplies = replies.slice(0, replyCount).map((item, index) => ({
    candidateIndex: index,
    style: cleanText(item?.style, 40),
    text: cleanText(item?.text, 800),
    rationale: cleanText(item?.rationale, 300),
    sendWhen: cleanText(item?.sendWhen, 160),
    branches: {
      positive: cleanText(item?.branches?.positive, 300),
      ambiguous: cleanText(item?.branches?.ambiguous, 300),
      refusal: cleanText(item?.branches?.refusal, 300),
    },
    observationWindow: cleanText(item?.observationWindow, 240),
    stopCondition: cleanText(item?.stopCondition, 200),
  })).filter((item) => item.style && item.text && item.sendWhen && item.branches.positive && item.branches.ambiguous && item.branches.refusal && item.observationWindow && item.stopCondition);
  const uniqueTexts = new Set();
  const uniqueReplies = normalizedReplies.filter((item) => {
    const key = normalizeReplyText(item.text);
    if (!key || uniqueTexts.has(key)) return false;
    uniqueTexts.add(key);
    return true;
  });
  const normalized = {
    profile: {
      summary: cleanText(profile.summary, 600),
      interests: stringArray(profile.interests),
      communicationStyle: cleanText(profile.communicationStyle, 300),
      preferredTopics: stringArray(profile.preferredTopics),
      avoidTopics: stringArray(profile.avoidTopics),
      evidence: Array.isArray(profile.evidence)
        ? profile.evidence.slice(0, 8).map((item) => ({ signal: cleanText(item?.signal, 160), source: cleanText(item?.source, 160) })).filter((item) => item.signal && item.source)
        : [],
      confidence: Math.max(0, Math.min(100, Number.parseInt(profile.confidence, 10) || 0)),
    },
    strategy: {
      approach: stringArray(strategy.approach, 6),
      boundaries: stringArray(strategy.boundaries, 6),
    },
    replies: uniqueReplies,
    openingTopics: stringArray(value?.openingTopics, 6),
    liveInvite: value?.liveInvite && typeof value.liveInvite === "object"
      ? {
          allowed: value.liveInvite.allowed === true,
          text: cleanText(value.liveInvite.text, 300),
          rationale: cleanText(value.liveInvite.rationale, 240),
        }
      : null,
    riskNotice: cleanText(value?.riskNotice, 500),
  };
  if (!normalized.profile.summary || normalized.strategy.approach.length < 2 || normalized.strategy.boundaries.length < 1 || normalized.replies.length !== replyCount || normalized.replies.length !== normalizedReplies.length) {
    throw new Error("INVALID_AI_SCHEMA");
  }
  return normalized;
}

export default async function handler(req, res) {
  setPrivateNoStore(res);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "仅支持 POST" });
  }
  if (isRateLimited(req)) {
    res.setHeader("Retry-After", String(Math.ceil(WINDOW_MS / 1000)));
    return res.status(429).json({ error: `本地接口请求过于频繁：${Math.ceil(WINDOW_MS / 60_000)} 分钟最多 ${MAX_REQUESTS} 次，请稍后再试`, code: "LOCAL_RATE_LIMIT" });
  }
  const activeUser = getCurrentUser(req);
  const guestToken = readGuestSessionToken(req);
  const guestStore = !activeUser && guestToken ? getAuthStore() : null;
  if (guestStore) guestStore.cleanupGuestData();
  const activeGuest = !activeUser && guestToken ? (getCurrentGuest(req) ? guestStore.touchGuestSession(guestToken) : null) : null;
  if (!activeUser && guestToken && !activeGuest) {
    clearGuestSessionCookie(res);
    if (authRequired() || req.body?.brotherId) return res.status(401).json({ error: "游客会话已失效，请重新登录", code: "GUEST_AUTH_REQUIRED" });
  }
  if ((authRequired() || req.body?.brotherId) && !activeUser && !activeGuest) {
    return res.status(401).json({ error: "请先登录后使用 AI 分析", code: "AUTH_REQUIRED" });
  }
  if (!process.env.ZAI_API_KEY) return res.status(503).json({ error: "服务器未配置 ZAI_API_KEY" });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  if (activeGuest && (body.brotherId || body.sourceMessageId || body.maintenanceTask || body.maintenanceTaskMode === "use")) {
    return res.status(403).json({ error: "游客只能使用自己的临时工作台，不能提交正式聊天对象或维护任务", code: "GUEST_SCOPE_FORBIDDEN" });
  }
  if (activeGuest) setGuestSessionCookie(res, guestToken, activeGuest.expiresAt);
  if (body.consent !== true) return res.status(400).json({ error: "请先确认你有权使用这些抖音素材" });

  const replyCount = Math.max(4, Math.min(8, Number.parseInt(body.replyCount, 10) || 8));
  const generationMode = normalizeGenerationMode(body.generationMode);
  const openingMode = normalizeOpeningMode(body.openingMode);
  const liveInviteEligible = body.allowLiveInvite === true && liveInviteStillEligible(body.lastLiveInviteAt);
  const sourceInput = body.sources && typeof body.sources === "object" ? body.sources : body;
  const material = {
    account: cleanText(body.account, 80),
    brotherId: cleanText(body.brotherId, 120),
    sourceMessageId: cleanText(body.sourceMessageId, 120),
    currentMessage: cleanText(body.currentMessage, 800),
    works: cleanText(sourceInput.works, 6000),
    comments: cleanText(sourceInput.comments, 6000),
    statements: cleanText(sourceInput.statements, 6000),
    history: Array.isArray(body.history)
      ? body.history.slice(0, 10).map((row) => ({
          sender: row?.sender === "anchor" ? "anchor" : "brother",
          message: cleanText(row?.msg, 500),
          reply: cleanText(row?.reply, 500),
          source: cleanText(row?.source, 40) || "paste",
        }))
      : [],
    replyCount,
    replyPreferences: stringArray(body.replyPreferences, 8),
    replyStyle: normalizeReplyStyle(body.replyStyle),
    maintenanceTaskMode: body.maintenanceTaskMode === "use" ? "use" : "ignore",
    maintenanceTask: body.maintenanceTask && typeof body.maintenanceTask === "object"
      ? {
          id: cleanText(body.maintenanceTask.id, 120),
          title: cleanText(body.maintenanceTask.title, 120),
          status: cleanText(body.maintenanceTask.status, 40),
          priority: cleanText(body.maintenanceTask.priority, 20),
          reason: cleanText(body.maintenanceTask.reason, 600),
          nextAction: cleanText(body.maintenanceTask.nextAction, 600),
          dueAt: cleanText(body.maintenanceTask.dueAt, 80),
          sourceMessageId: cleanText(body.maintenanceTask.sourceMessageId, 120),
        }
      : null,
    generationMode,
    openingMode,
    allowLiveInvite: liveInviteEligible,
    profile: body.profile && typeof body.profile === "object" ? body.profile : {},
  };
  material.allowLiveInvite = material.allowLiveInvite && hasLiveContentInterest(material);
  if (material.maintenanceTaskMode !== "use" || !material.maintenanceTask?.id) material.maintenanceTask = null;
  if (activeUser && material.brotherId) {
    if (!material.sourceMessageId) return res.status(409).json({ error: "请先选择一条已确认的大哥消息", code: "CHAT_SOURCE_MESSAGE_REQUIRED" });
    try {
      const scopedContext = getAuthStore().getChatGenerationContext({ actor: activeUser, brotherId: material.brotherId, sourceMessageId: material.sourceMessageId });
      // The server-owned message and history are authoritative. Never let a
      // browser request analyze a stale or unrelated transcript.
      material.currentMessage = scopedContext.currentMessage;
      material.history = scopedContext.history;
      material.sourceMessageId = scopedContext.sourceMessageId;
    } catch (error) {
      if (["CHAT_SOURCE_MESSAGE_REQUIRED", "CHAT_SOURCE_MESSAGE_NOT_FOUND"].includes(error?.message)) {
        return res.status(409).json({ error: "所选大哥消息已不存在或不是已确认消息，请重新选择", code: "CHAT_SOURCE_MESSAGE_INVALID" });
      }
      if (["CHAT_BROTHER_NOT_FOUND", "CHAT_ACCESS_DENIED"].includes(error?.message)) {
        return res.status(403).json({ error: "无权分析这段聊天记录", code: "CHAT_SCOPE_FORBIDDEN" });
      }
      console.error("Chat generation scope failed", error?.message || "Error");
      return res.status(500).json({ error: "聊天分析范围校验失败，请稍后重试", code: "CHAT_SCOPE_FAILED" });
    }
  }
  if (!material.currentMessage) return res.status(400).json({ error: "请先输入对方当前发言" });
  // Runtime 需要稳定的作用域标识。兼容旧会话对象（userId）和旧客户端仅提交 account 的请求，
  // 避免因为单个标识字段缺失而把本轮 AI 请求误报为“输入不完整”。
  const runtimeUserId = firstRuntimeId(120, activeUser?.id, activeUser?.userId, activeUser?.ownerUserId, activeGuest?.id, "anonymous");
  // The Runtime input keeps the stable userId for namespace construction, while
  // auth-store permission checks resolve actors by id. Carry both names so the
  // same authenticated actor remains valid across both contracts.
  const runtimeActor = { id: runtimeUserId, userId: runtimeUserId, role: cleanText(activeUser?.role, 40) || (activeGuest ? "guest" : "anchor") };
  const runtimeBrotherId = firstRuntimeId(120, material.brotherId, material.account, "profile-session");
  let runtimeMemoryAdapter = null;
  // 长期记忆目前只属于主播自己的工作区。运营和最高管理的个人聊天
  // 仍可正常走 Runtime，但不能把主播记忆适配器带进自己的会话，避免
  // 角色边界错误或把别的主播的长期记忆混入本轮分析。
  if (activeUser?.role === "anchor" && material.brotherId && typeof getAuthStore === "function") {
    const runtimeStore = getAuthStore();
    runtimeMemoryAdapter = {
      status: ({ actor, brotherId }) => runtimeStore.getRuntimeMemoryStatus({ actor, brotherId }),
    };
  }
  let runtimeResult;
  try {
    runtimeResult = analyzeGoutoujunshiRuntime({
      actor: runtimeActor,
      subject: { brotherId: runtimeBrotherId, alias: material.account },
      currentMessage: material.currentMessage,
      history: material.history,
      sources: material,
      profile: material.profile,
      replyPreferences: material.replyPreferences,
      replyStyle: material.replyStyle,
      memoryAdapter: runtimeMemoryAdapter,
    });
  } catch (error) {
    // Include Error.message in diagnostics; many domain errors intentionally use
    // plain Error instances (for example CHAT_BROTHER_NOT_FOUND) without a code.
    // Never expose this detail to the browser response.
    console.error("Goutoujunshi runtime failed", error?.code || error?.message || error?.name || "Error");
    if (error?.code === "RUNTIME_REFERENCE_NOT_ALLOWED" || error?.code === "RUNTIME_REFERENCE_UNAVAILABLE") {
      return res.status(503).json({ error: "goutoujunshi 核心参考资料不可用，请检查部署文件", code: "GOUTOUJUNSHI_CORE_UNAVAILABLE" });
    }
    const runtimeCode = error?.code || error?.message || "";
    if (runtimeCode === "ACTIVE_USER_REQUIRED") {
      return res.status(401).json({ error: "登录会话已失效，请重新登录", code: "AUTH_REQUIRED" });
    }
    if (["CHAT_BROTHER_NOT_FOUND", "CHAT_ACCESS_DENIED"].includes(runtimeCode)) {
      return res.status(409).json({ error: "维护对象服务端记录未同步，请刷新后重试", code: "RUNTIME_SCOPE_INVALID" });
    }
    if (runtimeCode === "RUNTIME_SCOPE_REQUIRED") {
      return res.status(400).json({ error: "goutoujunshi Runtime 输入不完整", code: runtimeCode });
    }
    return res.status(400).json({ error: "goutoujunshi Runtime 暂时不可用，请稍后重试", code: error?.code || "RUNTIME_FAILED" });
  }
  material.runtime = runtimeResult.runtime;
  material.intake = runtimeResult.intake;
  material.analysis = runtimeResult.analysis;
  material.memory = runtimeResult.memory;
  material.relationshipState = legacyRelationshipState(runtimeResult.analysis);
  material.knowledgeTopics = runtimeLegacyTopics(runtimeResult, material.currentMessage);
  const topicSummary = material.knowledgeTopics.includes("gift")
    ? "【礼物与金钱】平静感谢具体心意，不夸张兴奋、不暗示继续送、不把感情与消费绑定。遇到转账、借钱或贵重礼物，先说明边界和量力而行。"
    : material.knowledgeTopics.includes("distress")
      ? "【负面情绪】先倾听和回应具体感受，再决定是否追问；避免空泛鸡汤和永久陪伴承诺。"
      : material.knowledgeTopics.includes("privacy")
        ? "【隐私与越界】不索要或交换私照、住址、联系方式等敏感信息；遇到越界请求简短设限并停止推进。"
        : "当前消息未命中特定主题，遵循通用真诚、具体、有边界原则。";
  const openingInstructions = generationMode === "opening"
    ? `本轮是“日常开场”模式，主播选择的场景是 ${openingMode}。开场要从已确认事实、画像中的兴趣或上次真实话题中选一个自然入口，先给具体关心或轻松分享，再最多带一个不施压的问题。不要把没有证据的兴趣写成事实。请额外返回 openingTopics（最多 6 个可继续聊的真实话题），并在合规且确有兴趣信号时返回 liveInvite；否则 liveInvite 必须为 null 或 allowed=false。`
    : "本轮是针对对方当前发言的回复模式，不需要为了开场额外添加话题。";
  const systemPrompt = `你是中文直播私聊回复创作助手。你要根据用户有权提供的抖音作品文案、近期评论、公开发言、双方历史对话和结构化关系状态，先理解对方此刻真正需要的回应，再直接原创 ${replyCount} 条可以复制发送的中文回复。不要套用或改写任何本地固定话术；每条回复都要像真人临场说话，保留不同的表达风格、长度和节奏。

本轮必须以服务端 goutoujunshi Runtime 状态为上游判断结果。Runtime 身份、版本、阶段、事实、未知、风险、primaryGoal、decision 和参考资料 provenance 已由服务端计算；GLM-5.3 不得覆盖或重新发明这些状态，只负责在边界内原创表达。

本轮服务端 Runtime 上下文（长期记忆默认不会发给外部模型；只有主播本次明确授权时才可加入脱敏记忆）：
${runtimeResult.promptContext}

本轮按需加载的 goutoujunshi 上游原文摘录（仅用于理解算法边界，不得照抄为回复）：以上 Runtime 上下文中的 loadedReferences.excerpt 是服务端已校验的原文片段。

${MAINTENANCE_PRINCIPLES}

本轮维护任务建议：${material.maintenanceTask ? JSON.stringify(material.maintenanceTask) : "未采用维护任务建议"}
如果采用了任务建议，它只能作为本轮的工作方向提示，不能被当成对方事实、敏感属性或发送指令；仍以当前消息和服务端 Runtime 判断为准。

本轮按需知识摘要（只适用于命中的主题）：
${topicSummary}

本轮回复风格：${material.replyStyle}。${replyStyleInstruction(material.replyStyle)} 风格只是表达约束，必须服从证据、自然度和安全边界；不要在回复中解释风格设置。

${openingInstructions}

必须遵守：
1. 只使用素材中有直接证据的信号，不把猜测写成事实；证据不足时明确降低信心分。
2. 尊重隐私与自主决定：只根据已确认素材交流，不输出未经证实的个人属性判断，也不把猜测写成事实。
3. 不利用对方的脆弱处境或关系不对等，把情绪、现实压力或关系期待转化为义务、回报、消费或虚假亲密承诺。
4. 如当前消息包含借钱、色情、私照、威胁、自伤或其他高风险内容，回复应优先保护主播、设定边界，必要时建议寻求现实帮助。
5. 不要选择、排序、淘汰或评比某一条“最佳答案”。必须直接原创 ${replyCount} 条彼此明显不同的回复，全部返回给主播人工判断；candidateIndex 只按输出顺序从 0 开始编号，不能表达分数或推荐。
6. 先读取 relationshipState：algorithmCore 是上游 goutoujunshi 算法身份和按需参考资料，facts 是可引用事实，inferences 只能作为保守假设，unknowns 必须保持未知；risk、primaryGoal 和 decision 是硬约束。每条回复只完成 primaryGoal 指定的一个主要动作。
7. 不要复述固定模板。根据 primaryGoal 和素材证据自由组织句子，让回复在温度、长度、直接程度、幽默感和边界表达上有自然差异；不要输出分数或“最佳/推荐”等选择性结论。
8. currentMessage 是“对方发给主播的话”。回复 text 是“主播将直接发给对方的话”。必须严格区分说话人：不得把对方刚下班、加班、过生日等经历改写成主播刚下播、刚结束工作或主播自己的经历。
9. 拟人化要求：使用日常口语和自然停顿，长短句有变化；通常 1 至 3 句；最多一个自然追问；表情符号最多一个且非必要。避免客服腔、心理咨询腔、总结分析腔、过度完整的书面句和短视频鸡汤。
10. 温度必须来自对 currentMessage 具体细节的回应，而不是夸大的亲密承诺。禁止输出“我一直都在、我随时都在、永远陪你、你是唯一、只属于你、天荒地老、离不开你”等虚假承诺或依赖暗示。甜言蜜语风格也只能表达轻度欣赏和当下在意，不能承诺永久陪伴。
11. 避免机械套话与虚假温柔，例如不要每条都使用“辛苦啦、记得照顾自己、听起来你……”。只有上下文确实适合时才自然使用。不要为了显得亲密擅自添加“宝、哥哥、想你、抱抱”等称呼；只有用户输入的称呼或历史对话明确支持时才可沿用。
12. 不得根据普通问候推断依赖、控制欲、心理状态或隐藏动机。只有素材出现真实风险时才明确设限，普通场景应友好、克制、尊重双方时间。
13. 每条 text 必须可以直接复制发送，不包含分析口吻、策略说明或未由素材支持的事实。rationale 简短说明这条原创表达如何贴合当前目标和语境，不能给对方贴标签。
14. 除 text 外，每条回复还必须输出 sendWhen（适合发送时机）、branches 三个后续分支、observationWindow（发送后观察什么信号和多久不推进）和 stopCondition（可观察的停止条件）。positive 只在对方继续表达时向前接一步；ambiguous 遇到简短、表情或含糊回复时不连续追问；refusal 对方明确不想聊时简短尊重并收线。不要把这些分支写成操控话术，不要自动发送。
15. 如果返回 liveInvite，必须同时满足：对方素材明确谈到直播、相关内容或表现出想看你内容的兴趣；邀请是轻量、可拒绝、只描述直播内容，不加入费用、支持义务、回报或亏欠感；最近 24 小时已经邀请过或素材没有兴趣证据时，allowed 必须为 false 且 text 为空。liveInvite 只是一个可人工选择的候选，不是发送指令。
16. 仅输出一个 JSON 对象，不要输出 Markdown 代码块或其他说明。JSON 必须严格符合以下 Schema：${JSON.stringify(PROFILE_SCHEMA)}`;

  const usageStartedAt = Date.now();
  try {
    const providerResult = await callChatCompletion({
      env: process.env,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(material) },
      ],
      responseFormat: { type: "json_object" },
      options: {
        thinking: { type: "enabled" },
        reasoning_effort: "low",
        temperature: 0.55,
      },
      fetchImpl: fetch,
      timeoutMs: 75_000,
    });
    const payload = providerResult.payload;
    const model = providerResult.model;
    const text = outputText(payload);
    if (!text) {
      recordUsageSafely({ actor: activeUser, brotherId: material.brotherId, status: "error", errorCode: "EMPTY_RESPONSE", model, latencyMs: Date.now() - usageStartedAt });
      return res.status(502).json({ error: "AI 未返回可用结果" });
    }
    const generated = JSON.parse(text);
    validateGenerationAgainstRuntime(runtimeResult, generated);
    const normalizedResult = normalizeAIResult(generated, material.replyCount);
    const invite = normalizedResult.liveInvite;
    const inviteText = `${invite?.text || ""}${invite?.rationale || ""}`;
    const unsafeInvite = /礼物|打赏|刷|消费|支持主播|转账|充值|欠我|回报/.test(inviteText);
    if (!material.allowLiveInvite || !invite?.allowed || !invite.text || unsafeInvite) {
      normalizedResult.liveInvite = null;
    }
    recordUsageSafely({ actor: activeUser, brotherId: material.brotherId, status: "success", model, latencyMs: Date.now() - usageStartedAt });
    return res.status(200).json({
      ...normalizedResult,
      knowledgeTopics: material.knowledgeTopics,
      algorithmCore: material.relationshipState.algorithmCore,
      coreDecision: material.relationshipState.decision,
      runtime: runtimeResult.runtime,
      intake: runtimeResult.intake,
      analysis: runtimeResult.analysis,
      memory: runtimeResult.memory,
      replyStyle: material.replyStyle,
      model,
      provider: "zhipu",
    });
  } catch (error) {
    const usageStatus = error?.code === "AI_TIMEOUT" || error?.name === "TimeoutError" ? "timeout" : error?.code === "ZHIPU_RATE_LIMIT" ? "rate_limited" : "error";
    recordUsageSafely({ actor: activeUser, brotherId: material.brotherId, status: usageStatus, errorCode: error?.code || error?.message || "AI_REQUEST_FAILED", model: error?.model || "", latencyMs: Date.now() - usageStartedAt });
    console.error("Profile generation failed", error?.name || "Error", error?.code || "");
    if (error?.code === "INVALID_AI_POLICY") return res.status(502).json({ error: "AI 回复越过 Runtime 安全边界，请重试", code: "INVALID_AI_POLICY" });
    if (error?.message === "INVALID_AI_SCHEMA") return res.status(502).json({ error: "AI 返回的多元回复格式不合格，请重试", code: "INVALID_AI_SCHEMA" });
    if (error instanceof ProviderRequestError || error?.name === "ProviderRequestError") {
      if (error.code === "ZHIPU_KEY_INVALID") return res.status(502).json({ error: "智谱 API Key 无效或已过期，请更新 ZAI_API_KEY" });
      if (error.code === "ZHIPU_FORBIDDEN") return res.status(502).json({ error: "智谱 API Key 没有调用权限，请检查 GLM-5.3 模型和账号权限" });
      if (error.code === "ZHIPU_ACCOUNT_ARREARS") return res.status(429).json({ error: "智谱上游返回余额/额度类错误（不等于账户欠费）；请核对 API Key 类型与接口端点：GLM Coding Plan 使用 https://open.bigmodel.cn/api/coding/paas/v4，资源包/充值余额使用 https://open.bigmodel.cn/api/paas/v4", code: "ZHIPU_ACCOUNT_ARREARS" });
      if (error.code === "ZHIPU_RATE_LIMIT") {
        res.setHeader("Retry-After", "60");
        return res.status(429).json({ error: "智谱接口请求过于频繁，请稍后重试", code: "ZHIPU_RATE_LIMIT" });
      }
      if (error.code === "AI_TIMEOUT") return res.status(502).json({ error: "AI 分析超时，请重试" });
      return res.status(502).json({ error: "AI 分析服务暂时不可用" });
    }
    return res.status(502).json({ error: error?.name === "TimeoutError" ? "AI 分析超时，请重试" : "AI 分析失败" });
  }
}
