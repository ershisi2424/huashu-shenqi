import { recognizeImage, validateImageDataUrl } from "../../lib/ocr/adapter.cjs";
import { authRequired, getCurrentUser } from "../../lib/auth-session.cjs";

export const config = {
  api: {
    bodyParser: { sizeLimit: "10mb" },
  },
};

function parseBody(body) {
  if (body && typeof body === "object") return body;
  if (typeof body !== "string") return {};
  try { return JSON.parse(body); } catch { return {}; }
}

function jsonError(res, status, error, code) {
  return res.status(status).json({ error, code });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return jsonError(res, 405, "仅支持 POST 请求", "METHOD_NOT_ALLOWED");
  }
  if (authRequired() && !getCurrentUser(req)) {
    return jsonError(res, 401, "请先登录后使用截图识别", "AUTH_REQUIRED");
  }

  const body = parseBody(req.body);
  const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
  const validation = validateImageDataUrl(imageDataUrl);
  if (!validation.ok) {
    const messages = {
      INVALID_IMAGE_DATA_URL: "请上传 PNG、JPG 或 WebP 图片",
      UNSUPPORTED_IMAGE_TYPE: "暂只支持 PNG、JPG 或 WebP 图片",
      IMAGE_TOO_LARGE: "截图不能超过 8MB",
    };
    return jsonError(res, 400, messages[validation.error] || "图片无法识别", validation.error);
  }

  try {
    const result = await recognizeImage({
      imageDataUrl,
      language: typeof body.language === "string" ? body.language : "chi_sim+eng",
      imageWidth: Number.isFinite(Number(body.imageWidth)) && Number(body.imageWidth) > 0 ? Number(body.imageWidth) : undefined,
    });
    return res.status(200).json({
      importId: `ocr_${Date.now().toString(36)}`,
      blocks: result.blocks,
      language: result.language,
      requiresConfirmation: true,
      imageStored: false,
    });
  } catch (error) {
    const code = error?.code || "OCR_FAILED";
    if (["INVALID_IMAGE_DATA_URL", "UNSUPPORTED_IMAGE_TYPE", "IMAGE_TOO_LARGE"].includes(code)) {
      return jsonError(res, 400, "图片无法识别", code);
    }
    console.error("OCR recognition failed", code);
    return jsonError(res, 502, "截图识别暂不可用，请改为手动粘贴", code);
  }
}
