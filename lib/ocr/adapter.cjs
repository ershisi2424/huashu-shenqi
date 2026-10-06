const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function parseImageDataUrl(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const encoded = match[2].replace(/\s/g, "");
  if (!encoded || encoded.length % 4 === 1) return null;
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length) return null;
  return { mime, encoded, buffer };
}

function validateImageDataUrl(value) {
  const parsed = parseImageDataUrl(value);
  if (!parsed) return { ok: false, error: "INVALID_IMAGE_DATA_URL" };
  if (!SUPPORTED_MIME_TYPES.has(parsed.mime)) return { ok: false, error: "UNSUPPORTED_IMAGE_TYPE" };
  if (parsed.buffer.length > MAX_IMAGE_BYTES) return { ok: false, error: "IMAGE_TOO_LARGE" };
  return { ok: true, mime: parsed.mime, byteLength: parsed.buffer.length };
}

function decodeImageDataUrl(value) {
  const validation = validateImageDataUrl(value);
  if (!validation.ok) {
    const error = new Error(validation.error);
    error.code = validation.error;
    throw error;
  }
  const parsed = parseImageDataUrl(value);
  return { mime: parsed.mime, buffer: parsed.buffer };
}

function normalizeConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(1, number));
}

function normalizeBbox(value) {
  if (!value || typeof value !== "object") return null;
  const keys = ["x0", "y0", "x1", "y1"];
  if (!keys.every((key) => Number.isFinite(Number(value[key])))) return null;
  return keys.reduce((result, key) => ({ ...result, [key]: Number(value[key]) }), {});
}

function normalizeDimension(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function bboxCenter(bbox, axis) {
  if (!bbox) return null;
  const start = Number(bbox[axis === "x" ? "x0" : "y0"]);
  const end = Number(bbox[axis === "x" ? "x1" : "y1"]);
  return Number.isFinite(start) && Number.isFinite(end) ? (start + end) / 2 : null;
}

function inferSenders(blocks, imageWidth) {
  const positions = blocks
    .map((block, index) => ({ index, center: bboxCenter(block.bbox, "x") }))
    .filter((item) => item.center !== null);
  const senders = new Map();
  const width = normalizeDimension(imageWidth);

  if (width) {
    for (const { index, center } of positions) {
      const ratio = center / width;
      senders.set(index, ratio <= 0.44 ? "brother" : ratio >= 0.56 ? "anchor" : "unknown");
    }
    return senders;
  }

  // Some OCR engines omit the original image dimensions. Use the largest
  // horizontal gap between recognized bubbles as a conservative left/right
  // split, and leave a single-side/ambiguous capture for manual confirmation.
  if (positions.length < 2) return senders;
  const sorted = positions.slice().sort((a, b) => a.center - b.center || a.index - b.index);
  let split = null;
  for (let index = 1; index < sorted.length; index += 1) {
    const gap = sorted[index].center - sorted[index - 1].center;
    if (!split || gap > split.gap) split = { gap, index };
  }
  const range = sorted[sorted.length - 1].center - sorted[0].center;
  if (!split || split.gap <= 0 || (range > 0 && split.gap < range * 0.18)) return senders;
  const threshold = (sorted[split.index - 1].center + sorted[split.index].center) / 2;
  for (const { index, center } of positions) senders.set(index, center <= threshold ? "brother" : "anchor");
  return senders;
}

function compareOcrBlocks(a, b) {
  const ay = bboxCenter(a.bbox, "y");
  const by = bboxCenter(b.bbox, "y");
  if (ay === null && by !== null) return 1;
  if (ay !== null && by === null) return -1;
  if (ay !== null && by !== null && ay !== by) return ay - by;
  return a.index - b.index;
}

function normalizeOcrBlocks(value, options = {}) {
  const source = Array.isArray(value) ? value : value?.blocks;
  if (!Array.isArray(source)) return [];
  const blocks = source.map((item, index) => ({
    item,
    index,
  })).filter(({ item }) => typeof item?.text === "string" && item.text.trim()).map(({ item, index }) => ({
    id: `ocr_${index}`,
    text: item.text.replace(/\u0000/g, "").trim().slice(0, 800),
    sender: "unknown",
    confidence: normalizeConfidence(item.confidence),
    bbox: normalizeBbox(item.bbox || item.boundingBox),
    index,
  }));
  const imageWidth = normalizeDimension(options.imageWidth ?? (Array.isArray(value) ? null : value?.imageWidth));
  const senders = inferSenders(blocks, imageWidth);
  return blocks
    .map((block, index) => ({ ...block, sender: senders.get(index) || "unknown" }))
    .sort(compareOcrBlocks)
    .map(({ index, ...block }) => block);
}

async function recognizeImage({ imageDataUrl, language = "chi_sim+eng", imageWidth, recognizer } = {}) {
  const { mime, buffer } = decodeImageDataUrl(imageDataUrl);
  const runRecognizer = recognizer || (async (args) => {
    const adapter = require("./tesseract-adapter.cjs");
    return adapter.recognize(args);
  });
  const result = await runRecognizer({ buffer, mime, language });
  const detectedImageWidth = normalizeDimension(imageWidth) || normalizeDimension(result?.imageWidth || result?.width);
  return {
    blocks: normalizeOcrBlocks(result, { imageWidth: detectedImageWidth }),
    language: String(language || "chi_sim+eng").slice(0, 40),
  };
}

module.exports = {
  MAX_IMAGE_BYTES,
  SUPPORTED_MIME_TYPES,
  parseImageDataUrl,
  validateImageDataUrl,
  decodeImageDataUrl,
  inferSenders,
  normalizeOcrBlocks,
  recognizeImage,
};
