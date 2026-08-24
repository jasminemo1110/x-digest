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

test("translation preserves stable block IDs for interleaved bilingual reading", () => {
  const request = actions.buildActionRequest("translate", POST);
  assert.ok(request.maxTokens >= 1200);
  assert.match(request.messages[0].content, /Never merge, split, omit/);
  assert.match(request.messages[1].content, /TRANSLATION_BLOCKS/);
  const value = request.validate({ segments: [{ id: "b1", translationZh: "这是一个出乎意料地公允的看法。" }] });
  assert.equal(value.segments[0].original, POST.text);
  assert.equal(value.translationZh, "这是一个出乎意料地公允的看法。");
});

test("selected Library excerpts get a contextual Chinese translation", () => {
  const request = actions.buildActionRequest("translateExcerpt", POST, "surprisingly fair take");
  assert.equal(request.maxTokens, 500);
  assert.match(request.messages[0].content, /Translate only the selected English excerpt/);
  assert.match(request.messages[1].content, /SELECTED_EXCERPT/);
  assert.deepEqual(request.validate({ translationZh: "出乎意料地公允的看法" }), {
    translationZh: "出乎意料地公允的看法",
  });
  assert.throws(() => actions.buildActionRequest("translateExcerpt", POST, "not present"), /current post/);
});

test("explain accepts only text selected from the active post", () => {
  const request = actions.buildActionRequest("explain", POST, "fair take");
  assert.equal(request.maxTokens, 1600);
  assert.match(request.messages[0].content, /as_is, corrected, uncertain/);
  assert.match(request.messages[0].content, /selection-boundary problem/);
  assert.match(request.messages[0].content, /X-style slang/);
  assert.match(request.messages[0].content, /General American IPA/);
  assert.throws(() => actions.buildActionRequest("explain", POST, "missing words"), /current post/);
  assert.throws(() => actions.buildActionRequest("explain", POST, ""), /Select/);
});
