export const RUNTIME_META = {
  name: "goutoujunshi",
  version: "1.0.0",
  source: "https://github.com/shengjidaguai-china/goutoujunshi",
  sourceRevision: "6db7354a4002dc7c448a9c87ffdad8132570c9d3",
};

export const STAGES = ["emotion", "intake", "evidence", "knowledge", "decision", "action", "memory"];

export const PRIMARY_GOALS = ["承接", "降压", "调侃", "轻推", "约见", "澄清", "修复", "收线"];

export const SOURCE_TYPES = ["paste", "screenshot", "ocr", "transcript", "user_report", "public_material", "unknown"];

export const MAX_LIMITS = {
  currentMessage: 800,
  source: 6000,
  history: 10,
  alias: 120,
  profileField: 240,
  evidence: 8,
};
