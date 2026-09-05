const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
function harness() {
  const stored = {};
  const listener = { addListener() {} };
  const context = vm.createContext({ URL, console, chrome: {
    storage: { local: {
      get: async () => structuredClone(stored),
      set: async value => Object.assign(stored, structuredClone(value)),
    } },
    runtime: { onInstalled: listener, onMessage: listener, sendMessage: async () => {} },
    tabs: { onUpdated: listener, onActivated: listener },
  } });
  context.importScripts = (...names) => names.forEach(name => vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context));
  vm.runInContext(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), context);
  return { context, stored };
}
const post = { id: '123', url: 'https://x.com/u/status/123', text: Array.from({ length: 900 }, (_, i) => `Paragraph ${i} has a useful argument.`).join('\n\n') };

test('retries failed summary parts without re-requesting completed parts and caches final overview', async () => {
  const { context } = harness();
  const calls = [];
  let fail = true;
  context.callAi = async (action, part) => {
    calls.push(action);
    if (action === 'sectionDigest' && calls.length === 2 && fail) throw new Error('temporary failure');
    return action === 'sectionDigest' ? { titleZh: '节', summaryZh: '摘要' } : { summaryZh: '总览', keyPointsZh: [], toneZh: '' };
  };
  await assert.rejects(context.handleAction({ action: 'digestPost', post }), /temporary failure/);
  fail = false;
  const result = await context.handleAction({ action: 'digestPost', post });
  assert.ok(context.XDG_LONG_READING.validSections(result.value, post.text));
  const count = calls.length;
  assert.equal((await context.handleAction({ action: 'digestPost', post })).cached, true);
  assert.equal(calls.length, count);
  assert.equal(calls.filter(a => a === 'sectionDigest').length, result.value.sections.length + 1);
});

test('section translation cache is source-bound and long save does not invoke AI', async () => {
  const { context, stored } = harness();
  let calls = 0;
  context.callAi = async (_, part) => {
    calls += 1;
    const segments = context.XDG_LEARNING_DATA.segmentPostText(part.text).map(s => ({ ...s, translationZh: '译文' }));
    return { segments, translationZh: segments.map(s => s.translationZh).join('\n\n') };
  };
  const message = { action: 'translateSection', post, sectionId: 's1' };
  await context.handleAction(message);
  const count = calls;
  assert.equal((await context.handleAction(message)).cached, true);
  assert.equal(calls, count);
  await assert.rejects(context.handleAction({ ...message, sectionId: 's999' }), /Unknown/);
  assert.equal((await context.handleAction({ action: 'savePost', post })).originalOnly, true);
  assert.equal(calls, count);
  assert.equal(stored.xdg_saved_posts[0].text, post.text);
  await context.handleAction({ ...message, post: { ...post, text: 'Changed source.\n' + post.text } });
  assert.ok(calls > count);
  const backup = await context.readBackupData();
  const restored = context.XDG_BACKUP_DATA.validateBackup(context.XDG_BACKUP_DATA.createBackup(backup));
  assert.ok(restored.data.aiCache['123'].sectionTranslations.s1);
});
