const test = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");

global.crypto = webcrypto;
const data = require("../learning-data.js");

const POST = {
  id: "123456789",
  url: "https://x.com/example/status/123456789",
  text: "That's a surprisingly fair take.",
  authorName: "Example",
  handle: "@example",
};

const EXPLANATION = {
  rawSelectedText: "a fair take",
  selectedText: "a fair take",
  type: "expression",
  assessment: "as_is",
  assessmentEn: "This expression is correct and natural in context.",
  assessmentZh: "这个表达在当前语境中正确自然。",
  pronunciation: "",
  meaningZh: "公允的看法",
  explanationEn: "A balanced or reasonable opinion.",
  learningForm: "a fair take",
  usageZh: "常用于评价某人的观点比较客观。",
  exampleEn: "That is a fair take on the issue.",
  exampleZh: "这是对该问题很公允的看法。",
};

test("normalizes a valid X post and rejects non-status sources", () => {
  assert.equal(data.normalizePost(POST).recordId, "x-post:123456789");
  assert.throws(() => data.normalizePost({ ...POST, url: "https://example.com/123" }), /valid X post URL/);
});

test("validates and length-limits untrusted AI payloads", () => {
  assert.deepEqual(data.validateTranslationPayload({ translationZh: " 公允的看法。 " }), {
    translationZh: "公允的看法。",
  });
  assert.throws(() => data.validateDigestPayload({ toneZh: "冷静" }), /summaryZh/);
  assert.equal(data.validateExplanationPayload({ ...EXPLANATION, type: "unknown" }).type, "phrase");
  assert.throws(
    () => data.validateExplanationPayload({ ...EXPLANATION, assessment: "correct" }),
    /unsupported assessment/,
  );
  assert.throws(
    () => data.validateExplanationPayload({ ...EXPLANATION, type: "word", pronunciation: "" }),
    /valid IPA/,
  );
});

test("segments long posts and accepts only strictly aligned translations", () => {
  const segments = data.segmentPostText("First paragraph.\n\nSecond paragraph has another idea.");
  assert.deepEqual(segments, [
    { id: "b1", original: "First paragraph." },
    { id: "b2", original: "Second paragraph has another idea." },
  ]);
  const translated = data.validateTranslationPayload({ segments: [
    { id: "b1", translationZh: "第一段。" },
    { id: "b2", translationZh: "第二段有另一个观点。" },
  ] }, segments);
  assert.equal(translated.translationZh, "第一段。\n\n第二段有另一个观点。");
  assert.equal(data.isAlignedTranslation(translated, "First paragraph.\n\nSecond paragraph has another idea."), true);
  assert.throws(
    () => data.validateTranslationPayload({ segments: [{ id: "b1", translationZh: "第一段。" }] }, segments),
    /incomplete aligned translation/,
  );
});

test("requires IPA for words and preserves conservative naturalness diagnoses", () => {
  const word = data.validateExplanationPayload({
    ...EXPLANATION,
    rawSelectedText: "flaw",
    selectedText: "flaw",
    learningForm: "flaw",
    type: "word",
    pronunciation: "/flɔ/",
  });
  assert.equal(word.pronunciation, "/flɔ/");
  assert.equal(word.assessment, "as_is");

  const legacy = data.normalizeStoredExplanation({
    selectedText: "quota",
    learningForm: "quota",
    meaningZh: "限额",
    explanationEn: "A fixed allowance.",
  });
  assert.equal(legacy.learningForm, "quota");
  assert.equal(legacy.assessment, "unassessed");
  assert.match(legacy.assessmentZh, /旧记录/);
});

test("creates stable wordbook IDs and upgrades duplicate records", async () => {
  const first = await data.createWordbookEntry(POST, EXPLANATION, "2026-08-24T00:00:00.000Z");
  const second = await data.createWordbookEntry(POST, { ...EXPLANATION, meaningZh: "合理的观点", learningForm: "fair take" }, "2026-08-25T00:00:00.000Z");
  assert.equal(first.recordId, second.recordId);

  const result = data.upsertByRecordId([first], second);
  assert.equal(result.updated, true);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entry.createdAt, first.createdAt);
  assert.equal(result.entry.meaningZh, "合理的观点");
});

test("creates independently deduplicated Library excerpts from one post", async () => {
  const first = await data.createSavedExcerpt(POST, "surprisingly fair take");
  const duplicate = await data.createSavedExcerpt(POST, "surprisingly fair take");
  const second = await data.createSavedExcerpt(POST, "That's a surprisingly");
  assert.equal(first.kind, "excerpt");
  assert.equal(first.recordId, duplicate.recordId);
  assert.notEqual(first.recordId, second.recordId);
  assert.equal(data.upsertByRecordId([data.normalizePost(POST)], first).entries.length, 2);
  assert.match(data.libraryToMarkdown([first]), /Type: Excerpt[\s\S]*surprisingly fair take/);
  await assert.rejects(() => data.createSavedExcerpt(POST, "not in this post"), /current post/);
});

test("exports library, wordbook, and complete Markdown snapshots", async () => {
  const entry = await data.createWordbookEntry(POST, EXPLANATION);
  const saved = { ...POST, translationZh: "这倒是一个出乎意料地公允的看法。" };
  assert.match(data.libraryToMarkdown([saved]), /x-post:123456789[\s\S]*### 中文[\s\S]*出乎意料/);
  assert.match(data.wordbookToMarkdown([entry]), /a fair take[\s\S]*正确自然[\s\S]*<!-- xdg:/);
  assert.match(data.completeSnapshotToMarkdown([saved], [entry]), /Complete Snapshot[\s\S]*Saved Library[\s\S]*Wordbook/);
});
