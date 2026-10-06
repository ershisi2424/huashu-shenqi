const fs = require("fs");
const vm = require("vm");
const assert = require("node:assert/strict");

const source = fs.readFileSync(__dirname + "/pages/api/ocr.js", "utf8")
  .replace(/^import .*ocr\/adapter\.cjs.*$/m, "const { recognizeImage, validateImageDataUrl } = ocr;")
  .replace(/^import .*auth-session\.cjs.*$/m, "const authRequired = () => process.env.AUTH_REQUIRED === 'true'; const getCurrentUser = () => null;")
  .replace(/^export const config = /m, "const config = ")
  .replace("export default async function handler", "async function handler");
const context = {
  console,
  Date,
  JSON,
  String,
  ocr: {
    ...require("./lib/ocr/adapter.cjs"),
    async recognizeImage(args) {
      context.lastRecognizeArgs = args;
      return { blocks: [{ id: "ocr_0", text: "识别后的待确认消息", sender: "unknown", confidence: 0.9, bbox: null }], language: "chi_sim+eng" };
    },
  },
  lastRecognizeArgs: null,
  process: { env: { AUTH_REQUIRED: "false" } },
};
vm.createContext(context);
vm.runInContext(source + "\nglobalThis.ocrHandler = handler;", context);

async function call(body, method = "POST") {
  let status = 200;
  let payload;
  const headers = {};
  const req = { method, body };
  const res = {
    setHeader(name, value) { headers[name] = value; },
    status(value) { status = value; return this; },
    json(value) { payload = value; return this; },
  };
  await context.ocrHandler(req, res);
  return { status, payload, headers };
}

(async () => {
  assert.equal((await call({}, "GET")).status, 405);
  context.process.env.AUTH_REQUIRED = "true";
  const authDenied = await call({ imageDataUrl: `data:image/png;base64,${Buffer.from("png").toString("base64")}` });
  assert.equal(authDenied.status, 401);
  assert.equal(authDenied.payload.code, "AUTH_REQUIRED");
  context.process.env.AUTH_REQUIRED = "false";
  const invalid = await call({ imageDataUrl: "data:text/plain;base64,Zm9v" });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.payload.code, "INVALID_IMAGE_DATA_URL");
  const valid = await call({ imageDataUrl: `data:image/png;base64,${Buffer.from("png").toString("base64")}`, imageWidth: 1000, imageHeight: 1800 });
  assert.equal(valid.status, 200);
  assert.equal(valid.payload.requiresConfirmation, true);
  assert.equal(valid.payload.imageStored, false);
  assert.equal(valid.payload.blocks[0].sender, "unknown");
  assert.equal(context.lastRecognizeArgs.imageWidth, 1000);
  console.log("test-ocr-api: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
