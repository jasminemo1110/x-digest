const test = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");

global.crypto = webcrypto;
global.XDG_LEARNING_DATA = require("../learning-data.js");
global.XDG_READER_STATE = require("../reader-state.js");
const backups = require("../backup-data.js");

const POST = {
  id: "123456789",
  recordId: "x-post:123456789",
  url: "https://x.com/example/status/123456789",
  text: "That's a surprisingly fair take.",
  authorName: "Example",
  handle: "@example",
  translationZh: "这是一个非常公允的看法。",
  savedAt: "2026-08-24T00:00:00.000Z",
};

const ENTRY = {
  recordId: "a".repeat(64),
  rawSelectedText: "fair take",
  learningForm: "a fair take",
  type: "phrase",
  assessment: "as_is",
  meaningZh: "公允的看法",
  explanationEn: "A balanced opinion.",
  sourcePostId: POST.id,
  sourceText: POST.text,
  sourceUrl: POST.url,
  authorName: POST.authorName,
  handle: POST.handle,
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
};

test("round-trips a schema-versioned learning backup without credentials", () => {
  const backup = backups.createBackup({
    library: [POST],
    wordbook: [ENTRY],
    aiCache: {},
    readerPositions: { [POST.id]: { scrollY: 420, updatedAt: 10 } },
    apiKey: "must-not-export",
  }, "2026-08-26T00:00:00.000Z");
  const serialized = backups.stringifyBackup(backup);
  const parsed = backups.parseBackup(serialized);
  assert.equal(parsed.application, "x-digest");
  assert.equal(parsed.data.library[0].translationZh, POST.translationZh);
  assert.equal(parsed.data.wordbook[0].learningForm, ENTRY.learningForm);
  assert.equal(parsed.data.readerPositions[POST.id].scrollY, 420);
  assert.doesNotMatch(serialized, /must-not-export|apiKey/);
});

test("rejects unsupported, duplicate, and malformed backup records", () => {
  assert.throws(() => backups.parseBackup("not json"), /not valid JSON/);
  assert.throws(() => backups.validateBackup({ application: "x-digest", schemaVersion: 2, data: {} }), /not supported/);
  assert.throws(() => backups.createBackup({ library: [{ ...POST, recordId: "wrong" }], wordbook: [] }), /invalid Library post ID/);
  assert.throws(() => backups.createBackup({ library: [POST, POST], wordbook: [] }), /duplicate Library/);
});

test("merges by stable ID without deleting unrelated local records", () => {
  const newerPost = { ...POST, translationZh: "更新后的翻译。", savedAt: "2026-08-26T00:00:00.000Z" };
  const otherPost = {
    ...POST,
    id: "987654321",
    recordId: "x-post:987654321",
    url: "https://x.com/example/status/987654321",
    text: "Another saved post.",
  };
  const merged = backups.mergeBackupData(
    { library: [POST, otherPost], wordbook: [], aiCache: {}, readerPositions: {} },
    { library: [newerPost], wordbook: [ENTRY], aiCache: {}, readerPositions: {} },
  );
  assert.equal(merged.library.length, 2);
  assert.equal(merged.library.find((item) => item.recordId === POST.recordId).translationZh, "更新后的翻译。");
  assert.ok(merged.library.some((item) => item.recordId === otherPost.recordId));
  assert.equal(merged.wordbook.length, 1);
});

test("preserves incoming record order and keeps the newest timed state", () => {
  const newerPost = { ...POST, text: "Newest backup record." };
  const olderPost = {
    ...POST,
    id: "987654321",
    recordId: "x-post:987654321",
    url: "https://x.com/example/status/987654321",
    text: "Older backup record.",
  };
  const merged = backups.mergeBackupData(
    { library: [], wordbook: [], aiCache: {}, readerPositions: { [POST.id]: { scrollY: 10, updatedAt: 50 } } },
    { library: [newerPost, olderPost], wordbook: [], aiCache: {}, readerPositions: { [POST.id]: { scrollY: 20, updatedAt: 40 } } },
  );
  assert.deepEqual(merged.library.map((item) => item.recordId), [newerPost.recordId, olderPost.recordId]);
  assert.equal(merged.readerPositions[POST.id].scrollY, 10);
});
