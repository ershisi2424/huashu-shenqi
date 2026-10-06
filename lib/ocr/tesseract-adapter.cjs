async function recognize({ buffer, language = process.env.OCR_LANG || "chi_sim+eng" } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error("EMPTY_IMAGE_BUFFER");
  let createWorker;
  try {
    ({ createWorker } = require("tesseract.js"));
  } catch (error) {
    const wrapped = new Error("OCR_DEPENDENCY_UNAVAILABLE");
    wrapped.cause = error;
    wrapped.code = "OCR_DEPENDENCY_UNAVAILABLE";
    throw wrapped;
  }

  const worker = await createWorker(String(language || "chi_sim+eng").slice(0, 40), 1, {
    logger: () => {},
  });
  try {
    const result = await worker.recognize(buffer);
    const data = result?.data || {};
    const blocks = Array.isArray(data.blocks) && data.blocks.length
      ? data.blocks.map((block) => ({
          text: block.text,
          confidence: Number(block.confidence) / 100,
          bbox: block.bbox,
        }))
      : (data.text ? [{ text: data.text, confidence: Number(data.confidence) / 100 }] : []);
    const imageWidth = Number(data.imageWidth || data.width);
    const imageHeight = Number(data.imageHeight || data.height);
    return {
      blocks,
      text: data.text || "",
      ...(Number.isFinite(imageWidth) && imageWidth > 0 ? { imageWidth } : {}),
      ...(Number.isFinite(imageHeight) && imageHeight > 0 ? { imageHeight } : {}),
    };
  } finally {
    await worker.terminate();
  }
}

module.exports = { recognize };
