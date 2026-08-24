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
  selectedText: "fair take",
  type: "expression",
  meaningZh: "公允的看法",
  explanationEn: "A balanced or reasonable opinion.",
  learningForm: "a fair take",
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

test("exports library, wordbook, and complete Markdown snapshots", async () => {
  const entry = await data.createWordbookEntry(POST, EXPLANATION);
  const saved = { ...POST, translationZh: "这倒是一个出乎意料地公允的看法。" };
  assert.match(data.libraryToMarkdown([saved]), /x-post:123456789[\s\S]*### 中文[\s\S]*出乎意料/);
  assert.match(data.wordbookToMarkdown([entry]), /a fair take|<!-- xdg:/);
  assert.match(data.completeSnapshotToMarkdown([saved], [entry]), /Complete Snapshot[\s\S]*Saved Library[\s\S]*Wordbook/);
});
