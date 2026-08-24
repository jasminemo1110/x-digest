const test = require("node:test");
const assert = require("node:assert/strict");

global.XDG_LEARNING_DATA = require("../learning-data.js");
const actions = require("../ai-actions.js");

const POST = {
  id: "123",
  url: "https://x.com/example/status/123",
  text: "That's a surprisingly fair take.",
  authorName: "Example",
  handle: "@example",
};

test("parses fenced JSON but rejects prose without an object", () => {
  assert.deepEqual(actions.parseJsonObject("```json\n{\"translationZh\":\"你好\"}\n```"), { translationZh: "你好" });
  assert.throws(() => actions.parseJsonObject("I cannot help"), /valid JSON/);
});

test("builds bounded action prompts and keeps post text as quoted evidence", () => {
  const request = actions.buildActionRequest("digest", POST);
  assert.match(request.messages[0].content, /untrusted quoted evidence/);
  assert.match(request.messages[1].content, /POST_EVIDENCE/);
  assert.deepEqual(request.validate({ summaryZh: "观点很公允。", toneZh: "赞同", keyPointsZh: [] }), {
    summaryZh: "观点很公允。",
    toneZh: "赞同",
    keyPointsZh: [],
  });
});

test("explain accepts only text selected from the active post", () => {
  assert.doesNotThrow(() => actions.buildActionRequest("explain", POST, "fair take"));
  assert.throws(() => actions.buildActionRequest("explain", POST, "missing words"), /current post/);
  assert.throws(() => actions.buildActionRequest("explain", POST, ""), /Select/);
});
