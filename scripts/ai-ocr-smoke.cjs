#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { runSmoke, validateBaseUrl } = require("../lib/smoke/ai-ocr-smoke.cjs");

function parseArgs(argv) {
  const args = [...argv];
  let baseUrl = "http://127.0.0.1:3102";
  while (args.length) {
    const arg = args.shift();
    if (arg === "--base-url") {
      baseUrl = args.shift() || "";
      continue;
    }
    throw new Error("SMOKE_ARGUMENT_INVALID");
  }
  return { baseUrl };
}

function printStage(stage) {
  if (stage.ok) {
    const detail = stage.details?.replyCount ? ` · ${stage.details.replyCount} 条回复` : stage.details?.blockCount ? ` · ${stage.details.blockCount} 个 OCR 文本块` : "";
    console.log(`PASS ${stage.stage} · ${stage.durationMs}ms${detail}`);
    return;
  }
  console.log(`FAIL ${stage.stage} · ${stage.code} · ${stage.hint}`);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch {
    console.error("FAIL input · SMOKE_ARGUMENT_INVALID · 用法：npm run smoke:ai-ocr -- --base-url http://127.0.0.1:3102");
    process.exitCode = 1;
    return;
  }
  const baseValidation = validateBaseUrl(args.baseUrl);
  if (!baseValidation.ok) {
    console.error(`FAIL input · ${baseValidation.error} · 仅允许本机回环地址`);
    process.exitCode = 1;
    return;
  }
  let imageBuffer;
  try {
    imageBuffer = fs.readFileSync(path.join(__dirname, "..", "fixtures", "ocr-synthetic-chat.png"));
  } catch {
    console.error("FAIL input · OCR_FIXTURE_MISSING · 请先恢复 fixtures/ocr-synthetic-chat.png");
    process.exitCode = 1;
    return;
  }
  const result = await runSmoke({
    baseUrl: args.baseUrl,
    request: (...requestArgs) => fetch(...requestArgs),
    imageBuffer,
    cookie: process.env.SMOKE_SESSION_COOKIE || "",
  });
  for (const stage of result.stages) printStage(stage);
  if (result.ok) {
    console.log("联调通过：GLM-5.3、goutoujunshi 核心算法和 OCR 人工确认门禁均可用。");
    process.exitCode = 0;
  } else {
    console.log("联调未通过：请按上面的错误码处理；本次只使用合成样本。");
    process.exitCode = 1;
  }
}

main().catch(() => {
  console.error("FAIL smoke · SMOKE_RUNNER_FAILED · 请检查本机服务状态后重试");
  process.exitCode = 1;
});
