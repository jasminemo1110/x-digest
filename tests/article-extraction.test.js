const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const data = require("../learning-data.js");
global.XDG_LEARNING_DATA = data;
const actions = require("../ai-actions.js");

// Exercise the production extractor with DOM-shaped fixtures; live selectors
// are additionally checked on X because these fixtures cannot prove X markup.
const context = vm.createContext({ URL, location: { origin: "https://x.com", pathname: "/example/status/123" } });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../content.js"), "utf8").split("new MutationObserver(queueScan)")[0], context);
function fixture({ article = true, body = "First paragraph.\nSecond paragraph.", title = "Article title", identity = true } = {}) {
  const nodes = {};
  const root = { querySelectorAll: (s) => nodes[s] || [], getAttribute: () => null };
  const own = (text) => ({ innerText: text, closest: () => root });
  const link = { getAttribute: () => "/example/status/123" };
  nodes.time = identity ? [{ closest: (s) => s === 'a[href*="/status/"]' ? link : root, getAttribute: () => "2026-09-05" }] : [];
  nodes['[data-testid="tweetText"]'] = [own("Ordinary tweet")];
  if (article) {
    nodes['[data-testid="twitterArticleReadView"]'] = [own("")];
    nodes['[data-testid="twitter-article-title"]'] = [own(title)];
    nodes['[data-testid="twitterArticleRichTextView"]'] = body ? [own(body)] : [];
  }
  return { root, nodes };
}

test("reads article title and body in order, preserving paragraphs and status identity", () => {
  const { root } = fixture();
  const post = data.normalizePost(context.extractPost(root));
  assert.equal(post.text, "Article title\n\nFirst paragraph.\nSecond paragraph.");
  assert.equal(post.contentType, "article");
  assert.equal(post.recordId, "x-post:123");
  assert.equal(post.url, "https://x.com/example/status/123");
  assert.equal(post.textTruncated, undefined);
  assert.ok(actions.buildActionRequest("digest", post).messages[1].content.includes("Second paragraph."));
});

test("does not summarize a title-only article or one without a confirmed status ID", () => {
  assert.equal(context.extractPost(fixture({ body: "" }).root), null);
  assert.equal(context.extractPost(fixture({ identity: false }).root), null);
});

test("ignores article containers owned by quoted posts and still reads ordinary tweets", () => {
  const { root, nodes } = fixture({ article: false });
  nodes['[data-testid="twitterArticleReadView"]'] = [{ closest: () => ({}) }];
  const post = context.extractPost(root);
  assert.equal(post.text, "Ordinary tweet");
  assert.equal(post.contentType, undefined);
});

test("marks oversized articles through normalization and tells AI the source is partial", () => {
  const post = data.normalizePost(context.extractPost(fixture({ body: "x".repeat(21000) }).root));
  assert.equal(post.text.length, 20000);
  assert.equal(post.textTruncated, true);
  assert.equal(data.normalizePost(post).textTruncated, true);
  assert.match(actions.buildActionRequest("digest", post).messages[0].content, /partial-text summary/);
});
