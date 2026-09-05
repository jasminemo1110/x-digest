const test = require('node:test');
const assert = require('node:assert/strict');
global.XDG_LEARNING_DATA = require('../learning-data.js');
const reading = require('../long-reading.js');
const data = global.XDG_LEARNING_DATA;
const post = { id: '123', url: 'https://x.com/u/status/123', text: ('A paragraph with a complete argument.\n\n').repeat(2400) };

test('long source survives normalization and partitions without gaps or overlap', () => {
  assert.equal(data.normalizePost(post).text, post.text.trim());
  const parts = reading.split(post.text);
  assert.equal(parts.map(p => post.text.slice(p.start, p.end)).join(''), post.text);
  assert.ok(parts.every(p => p.end - p.start <= 8000));
  assert.equal(parts[parts.length - 1].end, post.text.length);
});

test('summaries cover the last paragraph and never trust AI to return source ranges', async () => {
  const supplied = [];
  const result = await reading.summarize(post, async (action, part) => {
    supplied.push({ action, text: part.text });
    return action === 'sectionDigest' ? { titleZh: '标题', summaryZh: '观点', start: 999999 } : { summaryZh: '全文总览', keyPointsZh: [], toneZh: '' };
  });
  assert.equal(supplied.filter(p => p.action === 'sectionDigest').map(p => p.text).join(''), post.text);
  assert.ok(reading.validSections(result, post.text));
  assert.equal(result.sections[0].start, 0);
  assert.equal(reading.validSections(result, post.text + 'changed'), false);
  result.sections[0].end += 1;
  assert.equal(reading.validSections(result, post.text), false);
});

test('translation batches preserve global segment identities and full coverage', async () => {
  const text = post.text.slice(0, 16000).trim();
  let requests = 0;
  const result = await reading.translate({ ...post, text }, async (_, part) => {
    requests += 1;
    assert.ok(part.text.length < 3000);
    return { segments: data.segmentPostText(part.text).map(s => ({ ...s, translationZh: '译文' })) };
  });
  assert.ok(requests > 1);
  assert.ok(data.isAlignedTranslation(result, text));
  await assert.rejects(reading.translate({ ...post, text }, async () => ({ segments: [] })), /does not match/);
});

test('summary references survive backup validation and invalid ranges are rejected', async () => {
  const normalized = data.normalizePost(post);
  const result = await reading.summarize(normalized, async action => action === 'sectionDigest'
    ? { titleZh: '标题', summaryZh: '观点' } : { summaryZh: '总览', keyPointsZh: [] });
  assert.ok(reading.validSections(data.validateDigestPayload(result), normalized.text));
  result.sections[0].end = 999999;
  assert.throws(() => data.validateDigestPayload(result), /Invalid summary/);
});

test('Markdown export includes summaries and exact source without long-block translations', async () => {
  const normalized = data.normalizePost({ ...post, text: post.text.slice(0, 16000).trim(), authorName: 'Writer' });
  const digest = await reading.summarize(normalized, async action => action === 'sectionDigest'
    ? { titleZh: '小节标题', summaryZh: '小节摘要' }
    : { summaryZh: '全文摘要', toneZh: '理性', keyPointsZh: ['要点'] });
  const markdown = reading.articleToMarkdown(normalized, digest, '2026-09-05T00:00:00.000Z');
  assert.match(markdown, /# A paragraph/);
  assert.match(markdown, /## Summary\n\n全文摘要/);
  assert.match(markdown, /### 分节摘要/);
  assert.match(markdown, /## Original/);
  assert.ok(markdown.includes(normalized.text));
  assert.doesNotMatch(markdown, /## 已生成的双语译文|## 中文|#### 中文/);
});
