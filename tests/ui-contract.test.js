const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("keeps translation behind reading modes and shows Explain only after selection", () => {
  const html = read("sidepanel.html");
  const script = read("sidepanel.js");
  assert.doesNotMatch(html, /id="translateButton"/);
  assert.match(html, /id="digestButton"[^>]*>Summarize</);
  assert.match(html, /id="selectionToolbar"[^>]*hidden/);
  assert.match(html, /id="explainButton"[^>]*>Explain</);
  assert.match(html, /id="explanationCard"[^>]*role="dialog"/);
  assert.match(script, /readingMode !== "original" && !hasTranslation/);
});

test("uses a warm light side panel and a visible inline Digest action", () => {
  const panelCss = read("sidepanel.css");
  const contentCss = read("content.css");
  assert.match(panelCss, /color-scheme:\s*light/);
  assert.match(panelCss, /--page:\s*#f7f3e9/);
  assert.match(contentCss, /background:\s*rgb\(29, 155, 240\)/);
});

test("re-inserts Digest when X replaces a processed post action bar", () => {
  const script = read("content.js");
  assert.doesNotMatch(script, /article\.hasAttribute\(PROCESSED_ATTRIBUTE\)/);
  assert.match(script, /firstOwned\(article, "\.x-digest-inline-button"\)/);
});

test("turns stale buttons into a refresh prompt after extension reload", () => {
  const script = read("content.js");
  assert.match(script, /globalThis\.chrome\?\.runtime/);
  assert.match(script, /button\.textContent = "Refresh X"/);
  assert.match(script, /sendMessage\([^;]+\)\.catch/);
});
