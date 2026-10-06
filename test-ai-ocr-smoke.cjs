const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { runSmoke, classifyFailure, validateBaseUrl } = require("./lib/smoke/ai-ocr-smoke.cjs");

const fixturePath = path.join(__dirname, "fixtures", "ocr-synthetic-chat.png");
const image = fs.readFileSync(fixturePath);

assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
assert.ok(image.length > 100, "合成 OCR 图片不能是空壳");
assert.ok(image.length < 8 * 1024 * 1024, "合成 OCR 图片必须在 API 限制以内");

assert.equal(validateBaseUrl("http://127.0.0.1:3102").ok, true);
assert.equal(validateBaseUrl("http://localhost:3102").ok, true);
assert.equal(validateBaseUrl("https://example.com").ok, false);

const syntheticMessage = "今天刚下班，有点累。";
const requests = [];
const request = async (url, options = {}) => {
  requests.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
  if (url.endsWith("/api/health")) {
    return { ok: true, status: 200, async json() { return { status: "configured", provider: "zhipu", configured: true, model: "glm-5.3", baseUrl: "https://open.bigmodel.cn/api/paas/v4" }; } };
  }
  if (url.endsWith("/api/profile")) {
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          provider: "zhipu",
          model: "glm-5.3",
          algorithmCore: { name: "goutoujunshi", revision: "test-revision" },
          coreDecision: { action: "先承接具体疲惫，再留一个轻问题" },
          profile: { summary: "最近工作较忙", confidence: 72 },
          replies: [0, 1, 2, 3].map((candidateIndex) => ({
            candidateIndex,
            style: ["自然聊天", "温柔关心", "轻松幽默", "成熟克制"][candidateIndex],
            text: `合成回复${candidateIndex + 1}`,
            sendWhen: "对方刚表达近况时",
            branches: { positive: "接一个具体细节", ambiguous: "不连续追问", refusal: "尊重并收线" },
            observationWindow: "观察对方是否继续表达",
            stopCondition: "对方明确不想聊",
          })),
        };
      },
    };
  }
  if (url.endsWith("/api/ocr")) {
    return { ok: true, status: 200, async json() { return { requiresConfirmation: true, imageStored: false, blocks: [{ id: "ocr_0", text: syntheticMessage, sender: "brother", confidence: 0.91 }] }; } };
  }
  throw new Error(`unexpected smoke URL: ${url}`);
};

(async () => {
  const result = await runSmoke({ baseUrl: "http://127.0.0.1:3102", request, imageBuffer: image, cookie: "session=do-not-print" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.stages.map((stage) => stage.stage), ["health", "ai", "ocr"]);
  assert.equal(requests.length, 3);
  assert.equal(requests[0].options.method, "GET");
  assert.equal(requests[1].options.method, "POST");
  assert.equal(requests[1].body.consent, true);
  assert.equal(requests[1].body.currentMessage, syntheticMessage);
  assert.equal(requests[1].body.account, "synthetic-smoke");
  assert.equal(requests[1].body.replyCount, 4);
  assert.equal(requests[1].body.apiKey, undefined);
  assert.match(requests[2].body.imageDataUrl, /^data:image\/png;base64,/);
  assert.equal(result.stages[1].details.replyCount, 4);
  assert.equal(result.stages[2].details.blockCount, 1);
  assert.doesNotMatch(JSON.stringify(result), /今天刚下班|do-not-print|test-key/);

  let calls = 0;
  const missingKey = await runSmoke({
    baseUrl: "http://127.0.0.1:3102",
    imageBuffer: image,
    request: async (url) => {
      calls += 1;
      assert.ok(url.endsWith("/api/health"));
      return { ok: true, status: 200, async json() { return { status: "configuration_required", provider: "zhipu", configured: false, model: "glm-5.3" }; } };
    },
  });
  assert.equal(missingKey.ok, false);
  assert.equal(calls, 1);
  assert.equal(missingKey.stages[0].code, "ZAI_API_KEY_MISSING");

  assert.equal(classifyFailure("ai", 401, { code: "ZHIPU_KEY_INVALID" }).code, "ZHIPU_KEY_INVALID");
  assert.equal(classifyFailure("ai", 503, { error: "服务器未配置 ZAI_API_KEY" }).code, "ZAI_API_KEY_MISSING");
  assert.equal(classifyFailure("ai", 429, { code: "ZHIPU_ACCOUNT_ARREARS" }).code, "ZHIPU_ACCOUNT_ARREARS");
  assert.equal(classifyFailure("ocr", 502, { code: "OCR_DEPENDENCY_UNAVAILABLE" }).code, "OCR_DEPENDENCY_UNAVAILABLE");
  assert.equal(classifyFailure("ocr", 400, { code: "INVALID_IMAGE_DATA_URL" }).code, "OCR_IMAGE_INVALID");

  const cliProbe = spawnSync(process.execPath, [path.join(__dirname, "scripts", "ai-ocr-smoke.cjs"), "--base-url", "https://example.com"], {
    encoding: "utf8",
    env: { ...process.env, SMOKE_SESSION_COOKIE: "session=do-not-print" },
  });
  assert.notEqual(cliProbe.status, 0);
  assert.match(`${cliProbe.stdout}\n${cliProbe.stderr}`, /SMOKE_BASE_URL_NOT_LOOPBACK|本机回环/);
  assert.doesNotMatch(`${cliProbe.stdout}\n${cliProbe.stderr}`, /do-not-print/);

  console.log("test-ai-ocr-smoke: runner contract passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
