const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("keeps translation behind reading modes and shows Explain only after selection", () => {
  const html = read("sidepanel.html");
  const script = read("sidepanel.js");
  const css = read("sidepanel.css");
  assert.doesNotMatch(html, /id="translateButton"/);
  assert.match(html, /id="digestButton"[^>]*>Summarize</);
  assert.match(html, /id="selectionToolbar"[^>]*hidden/);
  assert.match(html, /id="explainButton"[^>]*>Explain</);
  assert.match(html, /id="explanationCard"[^>]*role="dialog"/);
  assert.match(html, /src="ui-geometry\.js"/);
  assert.match(script, /readingMode === "bilingual" \? !hasAlignedTranslation/);
  assert.match(script, /positionNearSelection/);
  assert.match(css, /\.selection-toolbar[^}]+position:\s*fixed/);
});

test("renders aligned bilingual pairs and saves selected excerpts with N", () => {
  const html = read("sidepanel.html");
  const script = read("sidepanel.js");
  const css = read("sidepanel.css");
  const background = read("background.js");
  assert.match(html, /id="bilingualBlock"/);
  assert.match(script, /className = "bilingual-pair"/);
  assert.match(script, /event\.key\.toLowerCase\(\) === "n"/);
  assert.match(script, /send\("saveExcerpt"/);
  assert.match(background, /case "saveExcerpt"/);
  assert.match(background, /message\.recordId \? post\.recordId/);
  assert.match(css, /\.bilingual-translation/);
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
  assert.match(script, /post\.id === currentDetailStatusId\(\)/);
  assert.match(script, /detailRootSlot\(article\)/);
  assert.match(script, /function findDetailRoot\(\)/);
  assert.match(script, /document\.querySelectorAll\('\[data-testid="tweet"\]'\)/);
});

test("retires an Explain selection after opening and closing its result", () => {
  const script = read("sidepanel.js");
  assert.match(script, /function clearSelectionState\(\)/);
  assert.match(script, /\$\("selectionToolbar"\)\.hidden = true;[\s\S]+setBusy\(button, true, "Explaining…"\)/);
  assert.match(script, /function closeExplanation\(\)[\s\S]+clearSelectionState\(\)/);
});

test("reports new and duplicate Wordbook saves inside the explanation dialog", () => {
  const html = read("sidepanel.html");
  const script = read("sidepanel.js");
  assert.match(html, /id="wordbookSaveStatus"[^>]*role="status"/);
  assert.match(script, /result\.updated \? "Already saved" : "Saved"/);
  assert.match(script, /button\.textContent = "Saving…"/);
});

test("shows the learning form, IPA, naturalness, and examples as a structured learning card", () => {
  const html = read("sidepanel.html");
  const script = read("sidepanel.js");
  const css = read("sidepanel.css");
  assert.match(html, /id="explanationPronunciation"/);
  assert.match(html, /id="explanationAssessment"/);
  assert.match(html, /id="rawSelectionRow"/);
  assert.match(script, /Correct · 正确自然/);
  assert.match(script, /normalizeStoredExplanation\(entry\)/);
  assert.match(script, /Untitled expression/);
  assert.match(css, /\.wordbook-term strong[^}]+font-size:\s*19px/);
});

test("turns stale buttons into a refresh prompt after extension reload", () => {
  const script = read("content.js");
  assert.match(script, /globalThis\.chrome\?\.runtime/);
  assert.match(script, /button\.textContent = "Refresh X"/);
  assert.match(script, /sendMessage\([^;]+\)\.catch/);
});
