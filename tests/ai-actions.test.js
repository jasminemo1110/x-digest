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

test("repairs only JSON formatting and never sends post evidence on the repair attempt", () => {
  const request = actions.buildActionRequest("digest", POST);
  const messages = actions.buildJsonRepairMessages(request.repairContract, '{"summaryZh":"内容",}');
  assert.match(messages[0].content, /Fix only JSON syntax and field or array shape/);
  assert.match(messages[0].content, /Do not translate, summarize, explain, add facts, remove facts/);
  assert.match(messages[1].content, /OUTPUT_CONTRACT/);
  assert.match(messages[1].content, /summaryZh/);
  assert.doesNotMatch(messages[1].content, /POST_EVIDENCE/);
  assert.doesNotMatch(messages[1].content, new RegExp(POST.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("automatically accepts one format-only repair after invalid JSON", async () => {
  const request = actions.buildActionRequest("digest", POST);
  let repairs = 0;
  const result = await actions.validateJsonResponseWithRepair(
    '{"summaryZh":"内容",}',
    request.validate,
    async (candidate) => {
      repairs += 1;
      assert.equal(candidate, '{"summaryZh":"内容",}');
      return '{"summaryZh":"内容","toneZh":"平实","keyPointsZh":[]}';
    },
  );
  assert.equal(repairs, 1);
  assert.equal(result.repaired, true);
  assert.equal(result.value.summaryZh, "内容");
});

test("does not repair a valid response and reports a friendly error after one failed repair", async () => {
  const request = actions.buildActionRequest("digest", POST);
  let repairs = 0;
  const valid = await actions.validateJsonResponseWithRepair(
    '{"summaryZh":"内容","toneZh":"平实","keyPointsZh":[]}',
    request.validate,
    async () => { repairs += 1; return "{}"; },
  );
  assert.equal(valid.repaired, false);
  assert.equal(repairs, 0);

  await assert.rejects(
    actions.validateJsonResponseWithRepair("not json", request.validate, async () => {
      repairs += 1;
      return "still not json";
    }),
    /AI 返回格式异常，请重试。/,
  );
  assert.equal(repairs, 1);

  await assert.rejects(
    actions.validateJsonResponseWithRepair("", request.validate, async () => {
      repairs += 1;
      return '{"summaryZh":"不应凭空生成"}';
    }),
    /AI 返回格式异常，请重试。/,
  );
  assert.equal(repairs, 1);
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
  assert.match(request.messages[0].content, /Translate exactly and only the selected English excerpt/);
  assert.match(request.messages[1].content, /CONTEXT_DO_NOT_TRANSLATE/);
  assert.match(request.messages[1].content, /EXACT_EXCERPT_TO_TRANSLATE/);
  assert.deepEqual(request.validate({
    sourceText: "surprisingly fair take",
    translationZh: "出乎意料地公允的看法",
  }), {
    translationZh: "出乎意料地公允的看法",
  });
  assert.throws(
    () => request.validate({ sourceText: POST.text, translationZh: "这是一个出乎意料地公允的看法。" }),
    /selected excerpt boundary/,
  );
  assert.throws(
    () => request.validate({ sourceText: "surprisingly fair take", translationZh: "这段过长的译文并不只对应所选择的英文短语，而是错误地继续翻译了周围整整一段上下文内容，甚至还加入了这一段后面的更多句子和并未选中的补充说明。" }),
    /more than the selected excerpt/,
  );
  const repairMessages = request.buildRepairMessages('{"translationZh":"整段错误翻译"}');
  assert.match(repairMessages[0].content, /exactly and only/);
  assert.match(repairMessages[1].content, /INVALID_CANDIDATE/);
  assert.match(repairMessages[1].content, /EXACT_EXCERPT_TO_TRANSLATE/);
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

test("tells the model to repair a narrowly over-selected word boundary", () => {
  const request = actions.buildActionRequest("explain", {
    ...POST,
    text: "The AI riptide is already underway.",
  }, "riptide i");
  assert.match(request.messages[0].content, /selected "riptide i" in "riptide is"/);
  assert.match(request.messages[0].content, /learningForm "riptide"/);
});
