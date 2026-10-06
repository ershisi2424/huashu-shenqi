const assert = require("node:assert/strict");

const ocr = require("./lib/ocr/adapter.cjs");

const tinyPng = `data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}`;

assert.deepEqual(ocr.validateImageDataUrl(tinyPng), {
  ok: true,
  mime: "image/png",
  byteLength: 9,
});
assert.equal(ocr.validateImageDataUrl("data:text/plain;base64,Zm9v").ok, false);
assert.equal(ocr.validateImageDataUrl("not-an-image").ok, false);
assert.equal(ocr.validateImageDataUrl("data:image/png;base64,").ok, false);
assert.equal(ocr.validateImageDataUrl(`data:image/png;base64,${"a".repeat(11 * 1024 * 1024)}`).ok, false);

const normalized = ocr.normalizeOcrBlocks({
  imageWidth: 1000,
  blocks: [
    { text: "主播晚上见", confidence: 0.82, bbox: { x0: 700, y0: 120, x1: 940, y1: 170 } },
    { text: "", confidence: 0.5 },
    { text: "  大哥今天下班了吗？ ", confidence: 0.96, bbox: { x0: 40, y0: 40, x1: 300, y1: 90 } },
    { text: "居中待确认", confidence: 0.72, bbox: { x0: 440, y0: 200, x1: 560, y1: 240 } },
  ],
});
assert.deepEqual(normalized, [
  { id: "ocr_2", text: "大哥今天下班了吗？", sender: "brother", confidence: 0.96, bbox: { x0: 40, y0: 40, x1: 300, y1: 90 } },
  { id: "ocr_0", text: "主播晚上见", sender: "anchor", confidence: 0.82, bbox: { x0: 700, y0: 120, x1: 940, y1: 170 } },
  { id: "ocr_3", text: "居中待确认", sender: "unknown", confidence: 0.72, bbox: { x0: 440, y0: 200, x1: 560, y1: 240 } },
]);

const fallbackLayout = ocr.normalizeOcrBlocks({
  blocks: [
    { text: "右侧回复", confidence: 0.9, bbox: { x0: 700, y0: 80, x1: 920, y1: 130 } },
    { text: "左侧消息", confidence: 0.9, bbox: { x0: 30, y0: 20, x1: 260, y1: 70 } },
  ],
});
assert.deepEqual(fallbackLayout.map(({ text, sender }) => ({ text, sender })), [
  { text: "左侧消息", sender: "brother" },
  { text: "右侧回复", sender: "anchor" },
]);

let received = null;
const result = ocr.recognizeImage({
  imageDataUrl: tinyPng,
  language: "chi_sim+eng",
  recognizer: async (args) => {
    received = args;
    return { blocks: [{ text: "识别内容", confidence: 0.9 }] };
  },
});
assert.equal(typeof result.then, "function");
result.then((payload) => {
  assert.deepEqual(payload.blocks, [{ id: "ocr_0", text: "识别内容", sender: "unknown", confidence: 0.9, bbox: null }]);
  assert.equal(received.language, "chi_sim+eng");
  assert.equal(received.mime, "image/png");
  assert.ok(Buffer.isBuffer(received.buffer));
  console.log("test-ocr: ok");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
