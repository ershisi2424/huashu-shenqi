const assert = require("node:assert/strict");

const { checkReplyDraft } = require("./lib/reply-check.cjs");
const { normalizeReplyStyle, replyStyleInstruction } = require("./lib/reply-style.cjs");

const clear = checkReplyDraft({
  draft: "哥，今天辛苦了，先好好休息，明天有空再聊。",
  currentMessage: "今天有点累，先下了",
  recentReplies: ["晚上好哥，今天过得怎么样？"],
});
assert.equal(clear.level, "clear");
assert.equal(clear.warnings.length, 0);

const review = checkReplyDraft({
  draft: "哥你不送礼物我就不开心了，只有你最重要，马上转一点吧",
  currentMessage: "我最近压力有点大",
  recentReplies: [],
});
assert.equal(review.level, "review");
assert.ok(review.warnings.some((warning) => /礼物|转账|唯一|重要/.test(warning)));
assert.ok(review.suggestions.length > 0);

const blocked = checkReplyDraft({ draft: "", currentMessage: "你好", recentReplies: [] });
assert.equal(blocked.level, "block");

assert.equal(normalizeReplyStyle("warm"), "warm");
assert.equal(normalizeReplyStyle("not-a-style"), "balanced");
assert.match(replyStyleInstruction("humorous"), /轻松|幽默/);

console.log("test-chat-enhancements: ok");
