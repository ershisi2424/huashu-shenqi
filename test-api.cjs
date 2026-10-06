/* eslint-disable */
const fs = require("fs");
const vm = require("vm");

function assert(value, message) {
  if (!value) throw new Error(message);
}

(async () => {
  const knowledgeSource = fs.readFileSync(__dirname + "/lib/knowledge-router.js", "utf8")
    .replace(/^export function /gm, "function ");
  const coreSource = fs.readFileSync(__dirname + "/lib/goutoujunshi-core.js", "utf8")
    .replace(/^export const /gm, "const ")
    .replace(/^export function /gm, "function ");
  const profileSource = fs.readFileSync(__dirname + "/pages/api/profile.js", "utf8");
  assert(profileSource.includes("runtimeUserId"), "Runtime 必须从账号对象兼容提取稳定主播 ID");
  assert(profileSource.includes("id: runtimeUserId"), "Runtime 传给权限存储层的主播身份必须包含 id 字段");
  assert(profileSource.includes("runtimeBrotherId"), "Runtime 必须为维护对象提供稳定回退 ID");
  assert(profileSource.includes("RUNTIME_SCOPE_INVALID"), "Runtime 对象作用域失败必须返回明确诊断码");
  const { analyzeGoutoujunshiRuntime } = await import("./lib/goutoujunshi-runtime/index.js");
  const { validateGenerationAgainstRuntime } = await import("./lib/goutoujunshi-runtime/contract.js");
  let source = knowledgeSource + "\n" + coreSource + "\n" + profileSource
    .replace(/^import .*knowledge-router.*$/m, "")
    .replace(/^import .*goutoujunshi-core.*$/m, "")
    .replace(/^import .*goutoujunshi-runtime\/index\.js.*$/m, "")
    .replace(/^import .*goutoujunshi-runtime\/contract\.js.*$/m, "")
    .replace(/^import .*auth-session\.cjs.*$/m, "const authRequired = () => process.env.AUTH_REQUIRED === 'true'; const getCurrentUser = () => null; const getCurrentGuest = () => null; const getAuthStore = () => null; const readGuestSessionToken = () => ''; const setGuestSessionCookie = () => {}; const clearGuestSessionCookie = () => {}; const setPrivateNoStore = () => {};")
    .replace(/^import .*ai-provider\.cjs.*$/m, "const { callChatCompletion, ProviderRequestError } = provider;")
    .replace(/^import .*reply-style\.cjs.*$/m, "const { normalizeReplyStyle, replyStyleInstruction } = replyStyle;")
    .replace(/^import fs from "node:fs";$/m, "")
    .replace(/^import path from "node:path";$/m, "")
    .replace("export default async function handler", "async function handler");
  source += "\nglobalThis.profileHandler=handler;";
  const context = {
    console,
    Map,
    Date,
    String,
    JSON,
    Array,
    Object,
    AbortSignal,
    fs,
    path: require("path"),
    createHash: require("crypto").createHash,
    analyzeGoutoujunshiRuntime,
    validateGenerationAgainstRuntime,
    fetch: null,
    provider: require("./lib/ai-provider.cjs"),
    replyStyle: require("./lib/reply-style.cjs"),
    process: { cwd: () => __dirname, env: { ZAI_API_KEY: "test-key", ZHIPU_MODEL: "glm-5.3", ZHIPU_BASE_URL: "https://open.bigmodel.cn/api/paas/v4/chat/completions", PROFILE_RATE_LIMIT_MAX: "2", PROFILE_RATE_LIMIT_WINDOW_MS: "600000" } },
  };
  vm.createContext(context);
  vm.runInContext(source, context);

  async function call(body, method = "POST", remoteAddress = Math.random().toString()) {
    let status = 200;
    let payload;
    const headers = {};
    const req = { method, body, headers: {}, socket: { remoteAddress } };
    const res = {
      setHeader(name, value) { headers[name] = value; },
      status(value) { status = value; return this; },
      json(value) { payload = value; return this; },
    };
    await context.profileHandler(req, res);
    return { status, payload, headers };
  }

  assert((await call({}, "GET")).status === 405, "API 应拒绝非 POST 请求");
  assert((await call({ consent: false })).status === 400, "API 应要求素材授权确认");

  context.process.env.AUTH_REQUIRED = "true";
  const authDenied = await call({ consent: true, currentMessage: "在吗" }, "POST", "auth-required-test");
  assert(authDenied.status === 401 && authDenied.payload.code === "AUTH_REQUIRED", "开启强制登录后未登录 AI 请求应被服务端拒绝");
  context.process.env.AUTH_REQUIRED = "false";
  context.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    assert(_url === "https://open.bigmodel.cn/api/paas/v4/chat/completions", "API 应调用智谱 GLM-5.3 OpenAI 兼容端点");
    assert(request.response_format.type === "json_object", "API 应要求 JSON 输出");
    assert(request.model === "glm-5.3", "API 应使用 GLM-5.3");
    assert(request.thinking.type === "enabled", "GLM-5.3 应开启思考模式");
    assert(request.messages[0].content.includes("具体关心"), "AI 提示词应应用健康维护原则");
    assert(request.messages[0].content.includes("不故意慢回以抬高身价"), "AI 提示词应禁止操控性慢回策略");
    assert(request.messages[0].content.includes("尊重隐私与自主决定"), "AI 提示词应使用自然的边界表达");
    assert(!request.messages[0].content.includes("不诱导礼物与消费"), "AI 提示词不应暴露具体礼物限制词");
    assert(!request.messages[0].content.includes("不推断或输出种族、民族、宗教、政治立场、性取向、健康"), "AI 提示词不应暴露具体敏感属性清单");
    const requestMaterial = JSON.parse(request.messages[1].content);
    assert(requestMaterial.relationshipState, "智谱请求应包含结构化关系状态");
    try {
      assert(requestMaterial.runtime?.name === "goutoujunshi", "智谱请求应包含服务端 Runtime 身份");
      assert(Array.isArray(requestMaterial.runtime?.stages) && requestMaterial.runtime.stages.includes("decision"), "智谱请求应包含 Runtime 阶段链路");
      assert(Array.isArray(requestMaterial.analysis?.facts), "智谱请求应包含 Runtime 事实分析");
      assert(Array.isArray(requestMaterial.analysis?.unknowns), "智谱请求应保留 Runtime 未知项");
      if (requestMaterial.currentMessage === "在吗") {
        assert(requestMaterial.analysis?.primaryGoal === "承接", "智谱请求应使用服务端 Runtime 主目标");
      }
      assert(requestMaterial.analysis?.decision?.stopCondition, "智谱请求应包含 Runtime 停止条件");
      assert(requestMaterial.runtime.loadedReferences?.every((item) => item.sha256 && item.path), "Runtime 参考资料应带 provenance");
    } catch (error) {
      console.error("runtime-contract-mock-failure", error.message, requestMaterial);
      throw error;
    }
    if (requestMaterial.currentMessage === "在吗") {
      assert(requestMaterial.works === "他最近发了钓鱼视频", "作品素材必须进入服务端 AI 请求");
      assert(requestMaterial.comments === "评论区常说周末去钓鱼", "评论素材必须进入服务端 AI 请求");
      assert(requestMaterial.statements === "他说最近工作有点忙", "公开发言素材必须进入服务端 AI 请求");
    }
    assert(requestMaterial.relationshipState.algorithmCore?.name === "goutoujunshi", "智谱请求必须以 goutoujunshi 核心算法状态为上游判断");
    assert(requestMaterial.relationshipState.algorithmCore?.revision === "6db7354a4002dc7c448a9c87ffdad8132570c9d3", "智谱请求必须锁定 goutoujunshi 上游 revision");
    assert(requestMaterial.relationshipState.decision?.action, "智谱请求必须携带核心算法给出的动作");
    assert(request.messages[0].content.includes("上游原文摘录"), "提示词必须实际加载 goutoujunshi 上游参考资料，而非只发送路径");
    assert(request.messages[0].content.includes("一句话的生成流程"), "提示词必须加载上游话术编排算法正文");
    if (requestMaterial.currentMessage === "在吗") {
      assert(requestMaterial.relationshipState.facts.includes("对方当前发言：在吗"), "关系状态应保留当前发言事实");
      assert(requestMaterial.relationshipState.primaryGoal === "承接", "服务端必须以 goutoujunshi 核心算法结果为准，而非相信客户端伪造的目标");
      assert(Array.isArray(requestMaterial.knowledgeTopics) && requestMaterial.knowledgeTopics.length === 0, "普通问候不应路由无关主题知识");
    } else if (requestMaterial.currentMessage.includes("嘉年华")) {
      assert(requestMaterial.knowledgeTopics.includes("gift"), "礼物消息应路由礼物知识");
      assert(request.messages[0].content.includes("礼物与金钱"), "礼物消息提示词应包含对应知识摘要");
    }
    assert(request.messages[0].content.includes("facts"), "提示词应要求区分事实");
    assert(request.messages[0].content.includes("unknowns"), "提示词应要求保留未知");
    assert(request.messages[0].content.includes("primaryGoal"), "提示词应遵守单一主目标");
    assert(request.messages[0].content.includes("sendWhen"), "提示词应要求给出适合发送时机");
    assert(request.messages[0].content.includes("positive"), "提示词应要求给出正向承接分支");
    assert(request.messages[0].content.includes("ambiguous"), "提示词应要求给出含糊回复分支");
    assert(request.messages[0].content.includes("refusal"), "提示词应要求给出拒绝分支");
    assert(request.messages[0].content.includes("stopCondition"), "提示词应要求给出停止条件");
    if (requestMaterial.generationMode === "opening") {
      assert(request.messages[0].content.includes("日常开场"), "开场模式应明确要求根据已确认事实生成自然入口");
      assert(request.messages[0].content.includes("24 小时"), "开场模式应包含 24 小时邀请边界");
      assert(requestMaterial.allowLiveInvite === true || requestMaterial.allowLiveInvite === false, "开场请求应显式携带直播邀请资格");
    }
    assert(request.messages[0].content.includes("observationWindow"), "提示词应要求给出观察窗口");
    assert(!Object.hasOwn(requestMaterial, "candidates"), "直接原创模式不得发送本地固定候选");
    assert(requestMaterial.replyCount >= 4 && requestMaterial.replyCount <= 8, "直接原创模式应声明 4-8 条回复数量");
    assert(Array.isArray(requestMaterial.replyPreferences), "直接原创模式应发送回复偏好而不是本地话术");
    const dynamicStyles = ["自然聊天", "温柔关心", "轻松幽默", "成熟克制", "简短利落", "轻微暧昧", "高情商共情", "边界清晰"];
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [{ message: { content: JSON.stringify({
              profile: { summary: "喜欢钓鱼", interests: ["钓鱼"], communicationStyle: "自然", preferredTopics: ["户外"], avoidTopics: [], evidence: [{ signal: "钓鱼", source: "作品" }], confidence: 80 },
              strategy: { approach: ["聊户外", "问近况"], boundaries: ["不谈金钱"] },
              replies: request.messages[1].content
                ? dynamicStyles.slice(0, JSON.parse(request.messages[1].content).replyCount || 8).map((style, candidateIndex) => ({
                    candidateIndex,
                    style,
                    text: `${style}风格的原创回复 ${candidateIndex + 1}`,
                    rationale: "根据本轮关系目标和回复偏好，改写为更自然的口语表达",
                    sendWhen: "对方刚表达近况、愿意继续聊时",
                    branches: { positive: "对方继续讲时，接一个具体细节。", ambiguous: "对方只回表情时，本轮不连续追问。", refusal: "对方表示不想聊时，简短尊重并收线。" },
                    stopCondition: "对方明确不想继续或连续多轮没有互惠投入",
                    observationWindow: "发送后观察对方是否补充具体内容；若 24 小时无回应，不追加追问。",
                  }))
                : [],
              openingTopics: request.messages[1].content && JSON.parse(request.messages[1].content).generationMode === "opening"
                ? ["最近聊过的钓鱼", "周末怎么放松"]
                : [],
              liveInvite: request.messages[1].content && JSON.parse(request.messages[1].content).generationMode === "opening"
                ? { allowed: true, text: "今晚直播聊聊钓鱼，不方便也没关系", rationale: "对方曾提到钓鱼" }
                : null,
              riskNotice: "",
            }) } }],
        };
      },
    };
  };
  const mockedFetch = context.fetch;
  context.fetch = async (...args) => {
    try {
      return await mockedFetch(...args);
    } catch (error) {
      console.error("profile-mock-assertion", error.message);
      throw error;
    }
  };
  const success = await call({
    consent: true,
    currentMessage: "在吗",
    sources: {
      works: "他最近发了钓鱼视频",
      comments: "评论区常说周末去钓鱼",
      statements: "他说最近工作有点忙",
    },
    relationshipState: {
      facts: ["对方当前发言：在吗"],
      algorithmCore: { name: "fake-client-core", revision: "client-forged" },
      inferences: [],
      unknowns: ["双方熟悉程度未知"],
      evidence: [],
      emotion: { label: "未明确", intensity: 0, evidence: [] },
      risk: { level: "none", types: [] },
      primaryGoal: "收线",
      familiarity: "初识",
      reciprocity: [],
    },
    replyCount: 8,
    replyPreferences: ["自然", "温柔", "幽默", "克制"],
    replyStyle: "warm",
  });
  assert(success.status === 200 && success.payload.replies.length === 8, "AI 应直接生成 8 条原创回复");
  assert(success.payload.replies.every((row, index) => row.candidateIndex === index), "AI 原创结果应保持稳定顺序");
  assert(new Set(success.payload.replies.map((row) => row.style)).size === 8, "AI 原创结果应提供多元风格");
  assert(success.payload.replies.every((row) => !("score" in row)), "原创回复不应包含选择性评分");
  assert(success.payload.replies.every((row) => row.sendWhen && row.observationWindow && row.stopCondition && row.branches && row.branches.positive && row.branches.ambiguous && row.branches.refusal), "每条回复应包含后续分支、观察窗口与停止条件");
  assert(success.payload.model === "glm-5.3", "API 应返回实际模型名");
  assert(success.payload.provider === "zhipu", "API 应标记智谱服务商");
  assert(success.payload.algorithmCore?.name === "goutoujunshi", "API 应返回实际使用的 goutoujunshi 核心算法标识");
  assert(success.payload.coreDecision?.action, "API 应返回 goutoujunshi 核心算法动作");
  assert(success.payload.replyStyle === "warm", "API 应回传主播选择的回复风格");

  const opening = await call({
    consent: true,
    currentMessage: "最近总在看钓鱼视频",
    generationMode: "opening",
    openingMode: "continue_topic",
    allowLiveInvite: true,
    replyCount: 4,
  }, "POST", "opening-test");
  assert(opening.status === 200, "日常开场应走同一 AI 链路");
  assert(opening.payload.openingTopics.length === 2, "日常开场应返回画像驱动的可聊话题");
  assert(opening.payload.liveInvite?.allowed === true, "有明确兴趣且未在 24 小时内邀请时才允许返回轻直播邀请");
  assert(opening.payload.algorithmCore?.name === "goutoujunshi", "日常开场也必须经过 goutoujunshi 核心算法");
  const recentOpening = await call({
    consent: true,
    currentMessage: "最近总在看钓鱼视频",
    generationMode: "opening",
    openingMode: "continue_topic",
    allowLiveInvite: true,
    lastLiveInviteAt: new Date().toISOString(),
    replyCount: 4,
  }, "POST", "opening-recent-test");
  assert(recentOpening.status === 200 && recentOpening.payload.liveInvite === null, "24 小时内已经邀请过时服务端必须抑制邀请");
  const unrelatedOpening = await call({
    consent: true,
    currentMessage: "今天吃了什么",
    generationMode: "opening",
    openingMode: "casual",
    allowLiveInvite: true,
    replyCount: 4,
  }, "POST", "opening-unrelated-test");
  assert(unrelatedOpening.status === 200 && unrelatedOpening.payload.liveInvite === null, "没有直播或内容兴趣证据时必须抑制直播邀请");

  const money = await call({ consent: true, currentMessage: "哥给你刷了个嘉年华", replyCount: 4, relationshipState: { risk: { level: "none", types: [] }, emotion: { intensity: 0 } } });
  assert(money.status === 200 && money.payload.knowledgeTopics.includes("gift"), "礼物主题应返回路由结果");
  const topicCases = [
    ["今天被老板骂了，真不想干了", "distress"],
    ["周末有空吗，出来吃饭", "invitation"],
    ["你为什么不理我，是不是要拉黑我", "conflict"],
    ["发张私照看看", "privacy"],
  ];
  for (const [currentMessage, topic] of topicCases) {
    const result = await call({ consent: true, currentMessage, replyCount: 4 });
    assert(result.status === 200 && result.payload.knowledgeTopics.includes(topic), `${topic} 主题应被路由`);
  }
  context.fetch = async () => ({ ok: false, status: 401, async json() { return { error: { code: "invalid_api_key" } }; } });
  const invalidKey = await call({ consent: true, currentMessage: "在吗", replyCount: 4 });
  assert(invalidKey.status === 502 && /ZAI_API_KEY/.test(invalidKey.payload.error), "401 应返回可执行的智谱 Key 提示");
  context.fetch = async () => ({ ok: false, status: 429, async json() { return { error: { code: "rate_limit_exceeded" } }; } });
  const providerLimited = await call({ consent: true, currentMessage: "在吗", replyCount: 4 }, "POST", "provider-rate-test");
  assert(providerLimited.status === 429 && providerLimited.payload.code === "ZHIPU_RATE_LIMIT" && providerLimited.headers["Retry-After"], "智谱上游限流应返回独立错误码和重试时间");
  context.fetch = async () => ({ ok: false, status: 429, async json() { return { error: { code: "1113", message: "账户余额不足" } }; } });
  const arrears = await call({ consent: true, currentMessage: "在吗", replyCount: 4 }, "POST", "provider-arrears-test");
  assert(arrears.status === 429 && arrears.payload.code === "ZHIPU_ACCOUNT_ARREARS" && /不等于账户欠费|api\/coding\/paas\/v4|api\/paas\/v4/.test(arrears.payload.error), "智谱 1113 应提示核对端点与额度类型，而不是直接断言欠费");
  delete context.process.env.ZAI_API_KEY;
  context.process.env.DASHSCOPE_API_KEY = "legacy-key-should-not-be-used";
  const missingZhipuKey = await call({ consent: true, currentMessage: "在吗", replyCount: 4 });
  assert(missingZhipuKey.status === 503 && /ZAI_API_KEY/.test(missingZhipuKey.payload.error), "旧百炼 Key 不应被当成智谱 Key");
  context.process.env.ZAI_API_KEY = "test-key";
  assert((await call({ consent: false }, "POST", "rate-test")).status === 400, "限流测试第 1 次应先通过本地限流检查");
  assert((await call({ consent: false }, "POST", "rate-test")).status === 400, "限流测试第 2 次应先通过本地限流检查");
  const limited = await call({ consent: false }, "POST", "rate-test");
  assert(limited.status === 429 && limited.payload.code === "LOCAL_RATE_LIMIT" && limited.headers["Retry-After"], "本地限流应返回可区分的错误码和重试时间");
  context.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        choices: [{ message: { content: JSON.stringify({
          profile: { summary: "信息有限", interests: [], communicationStyle: "自然", preferredTopics: [], avoidTopics: [], evidence: [], confidence: 10 },
          strategy: { approach: ["先承接", "留空间"], boundaries: ["不越界"] },
          replies: Array.from({ length: 4 }, (_, candidateIndex) => ({
            candidateIndex,
            style: `风格${candidateIndex + 1}`,
            text: "重复的原创回复",
            rationale: "测试重复检测",
            sendWhen: "对方刚发来消息时",
            branches: { positive: "继续接具体内容", ambiguous: "不连续追问", refusal: "尊重并收线" },
            observationWindow: "观察对方是否继续表达",
            stopCondition: "对方明确不想聊",
          })),
          riskNotice: "",
        }) } }],
      };
    },
  });
  const duplicate = await call({ consent: true, currentMessage: "在吗", replyCount: 4 }, "POST", "duplicate-reply-test");
  assert(duplicate.status === 502 && duplicate.payload.code === "INVALID_AI_SCHEMA", "重复原创回复应被服务端拒绝");
  context.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        choices: [{ message: { content: JSON.stringify({
          profile: { summary: "信息有限", interests: [], communicationStyle: "自然", preferredTopics: [], avoidTopics: [], evidence: [], confidence: 10 },
          strategy: { approach: ["先承接", "留空间"], boundaries: ["不越界"] },
          replies: Array.from({ length: 4 }, (_, candidateIndex) => ({
            candidateIndex,
            style: `政策测试${candidateIndex + 1}`,
            text: candidateIndex === 0 ? "哥给我刷礼物我才开心" : `自然回复${candidateIndex + 1}`,
            rationale: "测试服务端边界",
            sendWhen: "对方刚发来消息时",
            branches: { positive: "继续接具体内容", ambiguous: "不连续追问", refusal: "尊重并收线" },
            observationWindow: "观察对方是否继续表达",
            stopCondition: "对方明确不想聊",
          })),
          riskNotice: "",
        }) } }],
      };
    },
  });
  const policyDrift = await call({ consent: true, currentMessage: "在吗", replyCount: 4 }, "POST", "policy-drift-test");
  assert(policyDrift.status === 502 && policyDrift.payload.code === "INVALID_AI_POLICY", "服务端应拒绝越过 Runtime 边界的 AI 回复");
  console.log("✅ 智谱 GLM-5.3 目标判断后直接原创多元回复和权限测试通过");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
