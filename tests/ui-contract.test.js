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
  assert.match(html, /id="explanationLoading"[^>]*hidden/);
  assert.match(html, /src="ui-geometry\.js"/);
  assert.match(script, /\["chinese", "bilingual"\]\.includes\(readingMode\) && !hasAlignedTranslation/);
  assert.match(script, /positionNearSelection/);
  assert.match(script, /renderExplanationLoading\(selectedText\)/);
  assert.match(script, /renderTranslationLoading\(\)/);
  assert.match(css, /\.selection-toolbar[^}]+position:\s*fixed/);
  assert.match(css, /\.loading-spinner/);
});

test("repairs malformed AI JSON once and keeps an older Summary clearly labeled", () => {
  const html = read("sidepanel.html");
  const script = read("sidepanel.js");
  const background = read("background.js");
  assert.match(background, /validateJsonResponseWithRepair/);
  assert.match(background, /buildJsonRepairMessages/);
  assert.match(background, /temperature: 0/);
  assert.match(html, /id="digestPrevious"[^>]*hidden[^>]*>上一次结果</);
  assert.match(script, /renderDigest\(activeDigest, \{ previous: true \}\)/);
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
  assert.match(script, /Saving bilingual excerpt…/);
  assert.match(background, /case "saveExcerpt"/);
  assert.match(background, /callAi\("translateExcerpt"/);
  assert.match(background, /message\.recordId \? post\.recordId/);
  assert.match(css, /\.bilingual-translation/);
});

test("shows bilingual saved posts and uses a distinct X Digest icon", () => {
  const script = read("sidepanel.js");
  const css = read("sidepanel.css");
  const manifest = JSON.parse(read("manifest.json"));
  const icon = read("icons/icon.svg");
  assert.match(script, /className = "library-translation"/);
  assert.match(script, /Translating and saving this post/);
  assert.match(css, /\.library-translation/);
  assert.equal(manifest.icons[128], "icons/icon128.png");
  assert.match(icon, /fill="#1d9bf0"/);
  assert.match(icon, /aria-label="X Digest"/);
  assert.match(icon, /data-symbol="cursor"/);
});

test("opens saved excerpts at their exact rendered source sentence", () => {
  const panel = read("sidepanel.js");
  const background = read("background.js");
  const content = read("content.js");
  const contentCss = read("content.css");
  assert.match(panel, /document\.createElement\("a"\)/);
  assert.match(panel, /href: post\.url, target: "_blank"/);
  assert.match(panel, /chrome\.storage\.local\.set/);
  assert.match(panel, /event\.preventDefault\(\)/);
  assert.match(panel, /await chrome\.storage\.local\.set/);
  assert.match(panel, /sourceText: post\.sourceText \|\| ""/);
  assert.match(panel, /await chrome\.tabs\.create\(\{ url: post\.url \}\)/);
  assert.match(panel, /expiresAt: Date\.now\(\) \+ 2 \* 60 \* 1000/);
  assert.match(panel, /Open at excerpt/);
  assert.doesNotMatch(background, /SOURCE_FOCUS_KEY|prepareLibrarySourceFocus|getSourceFocus/);
  assert.doesNotMatch(background, /chrome\.tabs\.create\(\{ url: post\.url \}\)/);
  assert.match(content, /function textRangeForExcerpt/);
  assert.match(content, /function scheduleSourceFocusRetry/);
  assert.match(content, /storage\.get\(SOURCE_FOCUS_KEY\)/);
  assert.match(content, /sourceText = typeof focus\?\.sourceText/);
  assert.match(content, /storage\?\.local\?\.remove\(SOURCE_FOCUS_KEY\)/);
  assert.match(content, /Date\.now\(\) \+ 10_000/);
  assert.match(content, /function expandSourcePostIfNeeded/);
  assert.match(content, /showMore\.click\(\)/);
  assert.match(content, /function scrollSourceRangeIntoView/);
  assert.match(content, /range\.getBoundingClientRect\(\)/);
  assert.match(content, /scrollContainer\.scrollTop \+ delta/);
  assert.match(content, /window\.scrollBy\(\{ top: rangeCenter - viewportHeight \/ 2, behavior \}\)/);
  assert.match(content, /\[250, 900, 2000\]\.forEach/);
  assert.match(content, /textRangeForExcerpt\(root, focus\)/);
  assert.match(content, /CSS\.highlights\.set\("x-digest-source-focus"/);
  assert.match(content, /selection\?\.addRange\(range\.cloneRange\(\)\)/);
  assert.match(contentCss, /html\.x-digest-source-focusing ::selection/);
  assert.match(contentCss, /::highlight\(x-digest-source-focus\)/);
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
  assert.match(script, /publishedAt: time\?\.getAttribute\("datetime"\)/);
  assert.match(script, /action: "refreshActivePost"/);
  assert.match(script, /const currentPost = extractPost\(article\) \|\| post/);
});

test("invalidates partial translations and summaries when Show More changes the source text", () => {
  const panel = read("sidepanel.js");
  const background = read("background.js");
  assert.match(panel, /\["chinese", "bilingual"\]\.includes\(readingMode\) && !hasAlignedTranslation/);
  assert.match(panel, /cached\.digest\?\.sourceText === post\.text/);
  assert.match(background, /cached\?\.sourceText === post\.text/);
  assert.match(background, /refreshActivePost/);
});

test("warns before local storage or collection limits are reached", () => {
  const html = read("sidepanel.html");
  const script = read("sidepanel.js");
  const background = read("background.js");
  assert.match(html, /id="storageNotice"[^>]*role="status"[^>]*hidden/);
  assert.match(background, /getBytesInUse\(null\)/);
  assert.match(script, /storageWarning\(/);
});

test("filters Library and Wordbook with accessible local bilingual search", () => {
  const html = read("sidepanel.html");
  const script = read("sidepanel.js");
  const css = read("sidepanel.css");
  assert.match(html, /id="librarySearchInput"[^>]*aria-controls="libraryList"/);
  assert.match(html, /id="wordbookSearchInput"[^>]*aria-controls="wordbookList"/);
  assert.match(html, /id="librarySearchCount"[^>]*aria-live="polite"/);
  assert.match(script, /collectionMatchesQuery\("library"/);
  assert.match(script, /collectionMatchesQuery\("wordbook"/);
  assert.match(script, /event\.key !== "Escape"/);
  assert.match(script, /document\.createElement\("mark"\)/);
  assert.match(css, /\.search-highlight/);
});

test("closes or disables the side panel after leaving X", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const background = read("background.js");
  assert.ok(manifest.permissions.includes("tabs"));
  assert.match(background, /panel-lifecycle\.js/);
  assert.match(background, /chrome\.tabs\.onUpdated\.addListener/);
  assert.match(background, /chrome\.tabs\.onActivated\.addListener/);
  assert.match(background, /XDG_PANEL_LIFECYCLE\.updatePanelForTab/);
});

test("restores an independent Reader position for each post", () => {
  const html = read("sidepanel.html");
  const script = read("sidepanel.js");
  assert.match(html, /src="reader-state\.js"/);
  assert.match(script, /READER_POSITIONS_KEY = "xdg_reader_positions"/);
  assert.match(script, /persistReaderPosition\(activePost\.id, \$\("readingViewport"\)\.scrollTop\)/);
  assert.match(script, /XDG_READER_STATE\.positionFor/);
  assert.match(script, /requestId !== readerPositionRequestId/);
  assert.match(script, /document\.visibilityState === "hidden"/);
});

test("keeps long-article language controls outside the scrolling body and translates the located section", () => {
  const html = read("sidepanel.html");
  const script = read("sidepanel.js");
  const css = read("sidepanel.css");
  assert.match(html, /class="mode-switch"[\s\S]+id="readingViewport" class="reading-viewport"/);
  assert.match(css, /\.reading-viewport[^}]+overflow-y:\s*auto/);
  assert.match(script, /activeLongSectionId = section\.id;[\s\S]+readingMode = "original"/);
  assert.match(script, /\$\("readingShell"\)\.scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  assert.match(script, /send\("translateSection", \{ post, sectionId: section\.id \}\)/);
  assert.doesNotMatch(script, /translate\.textContent = "翻译本节"/);
  assert.doesNotMatch(script, /original\.textContent = post\.text\.slice\(section\.start, section\.end\)/);
});

test("exports the active digest with summary and source only", () => {
  const html = read("sidepanel.html");
  const script = read("sidepanel.js");
  assert.match(html, /id="exportDigestMarkdown"[^>]*>导出 Markdown</);
  assert.match(script, /XDG_LONG_READING\.articleToMarkdown/);
  assert.match(script, /Markdown 已导出，包含摘要和完整原文/);
});

test("exports and safely merges a lossless JSON learning backup without the API key", () => {
  const html = read("sidepanel.html");
  const script = read("sidepanel.js");
  const background = read("background.js");
  assert.match(html, /id="exportJsonButton"/);
  assert.match(html, /id="restoreJsonInput"[^>]*accept="application\/json,\.json"/);
  assert.match(html, /src="backup-data\.js"/);
  assert.match(script, /x-digest-before-restore/);
  assert.match(script, /Existing matching IDs will be updated/);
  assert.match(script, /API Key was not included/);
  assert.match(script, /incompatible legacy AI cache/);
  assert.match(background, /case "exportJsonBackup"/);
  assert.match(background, /case "restoreJsonBackup"/);
  assert.doesNotMatch(background.match(/async function readBackupData\(\)[\s\S]*?^}/m)?.[0] || "", /XDG_SETTINGS|apiKey/);
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
