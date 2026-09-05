"use strict";

let activePost = null;
let activeTranslation = null;
let activeDigest = null;
let activeExplanation = null;
let selectedText = "";
let collections = { posts: [], entries: [], cache: {} };
let readingMode = "original";
let translationPending = false;
let translationRequestId = 0;
let digestRequestId = 0;
let selectedRange = null;
let explanationRequestId = 0;
let excerptSavePending = false;
let librarySearchQuery = "";
let wordbookSearchQuery = "";
let currentView = "reader";
let readerPositionSaveTimer = 0;
let readerPositionRequestId = 0;
let suppressReaderPositionSave = false;
let activeLongSectionId = "";
let sectionTranslationPending = "";

const READER_POSITIONS_KEY = "xdg_reader_positions";
const SOURCE_FOCUS_KEY = "xdg_source_focus";

const $ = (id) => document.getElementById(id);

function setStatus(message, isError = false) {
  $("status").textContent = message || "";
  $("status").classList.toggle("error", isError);
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = label;
  } else if (button.dataset.label) {
    button.textContent = button.dataset.label;
    delete button.dataset.label;
  }
}

async function send(action, payload = {}) {
  const response = await chrome.runtime.sendMessage({ action, ...payload });
  if (!response?.success) throw new Error(response?.error || "X Digest did not respond.");
  return response;
}

function hasLongReadingSections() {
  return !!activePost && XDG_LONG_READING.validSections(activeDigest, activePost.text);
}

function longSectionById(sectionId) {
  return hasLongReadingSections()
    ? activeDigest.sections.find((section) => section.id === sectionId) || null
    : null;
}

function cachedSectionTranslation(section) {
  const value = collections.cache?.[activePost?.id]?.sectionTranslations?.[section?.id];
  const sourceText = section && activePost?.text.slice(section.start, section.end);
  return value?.sourceText === sourceText && XDG_LEARNING_DATA.isAlignedTranslation(value, sourceText)
    ? value
    : null;
}

function visibleLongSectionId() {
  if (!hasLongReadingSections()) return "";
  const viewport = $("readingViewport");
  const nodes = [...$("postText").querySelectorAll("[data-long-section-id]")];
  const marker = viewport.scrollTop + Math.min(80, viewport.clientHeight / 3);
  return nodes.reduce((current, node) => node.offsetTop <= marker ? node.dataset.longSectionId : current, "")
    || activeLongSectionId
    || activeDigest.sections[0]?.id
    || "";
}

function makeOriginalSection(section, active) {
  const node = document.createElement("section");
  node.className = "long-reading-section";
  node.dataset.longSectionId = section.id;
  node.dataset.active = String(active);
  node.textContent = activePost.text.slice(section.start, section.end);
  return node;
}

function appendTranslatedSection(node, translation, bilingual) {
  for (const segment of translation.segments) {
    if (bilingual) {
      const original = document.createElement("p");
      original.className = "bilingual-original";
      original.dataset.originalText = "true";
      original.textContent = segment.original;
      node.append(original);
    }
    const translated = document.createElement("p");
    translated.className = "bilingual-translation";
    translated.textContent = segment.translationZh;
    node.append(translated);
  }
}

function renderLongReadingBody() {
  const sections = activeDigest.sections;
  if (!longSectionById(activeLongSectionId)) activeLongSectionId = sections[0]?.id || "";
  const nodes = sections.map((section) => {
    const active = section.id === activeLongSectionId;
    const translation = cachedSectionTranslation(section);
    const node = makeOriginalSection(section, active);
    if (readingMode === "original") return node;
    node.replaceChildren();
    if (translation) {
      appendTranslatedSection(node, translation, readingMode === "bilingual");
    } else {
      const note = document.createElement("span");
      note.className = "section-mode-note";
      note.textContent = sectionTranslationPending === section.id
        ? "正在翻译这一节…"
        : active ? "本节尚未翻译。正在准备按需翻译…" : "本节尚未翻译，暂时显示原文。";
      node.append(note, document.createTextNode(activePost.text.slice(section.start, section.end)));
    }
    return node;
  });
  $("postText").replaceChildren(...nodes);
  $("originalBlock").hidden = false;
  $("translationBlock").hidden = true;
  $("bilingualBlock").hidden = true;
  $("originalBlock").querySelector(".block-label").textContent = {
    original: "Original",
    chinese: "中文 · 未翻译小节保留原文",
    bilingual: "双语 · 未翻译小节保留原文",
  }[readingMode];
}

async function translateActiveLongSection() {
  const section = longSectionById(activeLongSectionId || visibleLongSectionId());
  if (!section || cachedSectionTranslation(section) || sectionTranslationPending) return;
  const post = activePost;
  sectionTranslationPending = section.id;
  renderLongReadingBody();
  setStatus(`正在翻译“${section.titleZh}”…`);
  try {
    const result = await send("translateSection", { post, sectionId: section.id });
    if (activePost?.id !== post.id || activePost?.text !== post.text) return;
    const cache = collections.cache[post.id] || {};
    cache.sectionTranslations = {
      ...(cache.sectionTranslations || {}),
      [section.id]: { ...result.value, sourceText: post.text.slice(section.start, section.end) },
    };
    collections.cache[post.id] = cache;
    setStatus(result.cached ? "已载入本节译文。" : "本节翻译完成。");
  } catch (error) {
    if (activePost?.id === post.id) setStatus(error.message, true);
  } finally {
    if (sectionTranslationPending === section.id) sectionTranslationPending = "";
    if (activePost?.id === post.id) renderLongReadingBody();
  }
}

function renderReadingMode() {
  if (hasLongReadingSections()) {
    renderLongReadingBody();
    if (readingMode !== "original" && !cachedSectionTranslation(longSectionById(activeLongSectionId))) {
      void translateActiveLongSection();
    }
  } else {
    $("originalBlock").querySelector(".block-label").textContent = "Original";
    const hasAlignedTranslation = XDG_LEARNING_DATA.isAlignedTranslation(activeTranslation, activePost?.text);
    $("originalBlock").hidden = readingMode !== "original";
    $("translationBlock").hidden = readingMode !== "chinese" || !hasAlignedTranslation;
    $("bilingualBlock").hidden = readingMode !== "bilingual" || !hasAlignedTranslation;
    const translationNeeded = ["chinese", "bilingual"].includes(readingMode) && !hasAlignedTranslation;
    if (translationNeeded) translateActivePost();
  }
  document.querySelectorAll(".mode-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === readingMode);
  });
}

function renderTranslation(value) {
  activeTranslation = value || null;
  $("translationText").textContent = activeTranslation?.translationZh || "";
  const pairs = Array.isArray(activeTranslation?.segments) ? activeTranslation.segments.map((segment) => {
    const pair = document.createElement("section");
    pair.className = "bilingual-pair";
    const original = document.createElement("p");
    original.className = "bilingual-original";
    original.dataset.originalText = "true";
    original.textContent = segment.original;
    const translated = document.createElement("p");
    translated.className = "bilingual-translation";
    translated.textContent = segment.translationZh;
    pair.append(original, translated);
    return pair;
  }) : [];
  $("bilingualBlock").replaceChildren(...pairs);
}

function createLoadingNode(label) {
  const loading = document.createElement("span");
  loading.className = "inline-loading";
  const spinner = document.createElement("span");
  spinner.className = "loading-spinner";
  spinner.setAttribute("aria-hidden", "true");
  const text = document.createElement("span");
  text.textContent = label;
  loading.append(spinner, text);
  return loading;
}

function renderTranslationLoading() {
  if (readingMode === "bilingual") {
    $("bilingualBlock").replaceChildren(createLoadingNode("Translating aligned bilingual blocks…"));
    $("bilingualBlock").hidden = false;
  } else if (readingMode === "chinese") {
    $("translationText").replaceChildren(createLoadingNode("Translating this post…"));
    $("translationBlock").hidden = false;
  }
}

function renderDigest(value, { previous = false } = {}) {
  activeDigest = value || null;
  $("digestCard").hidden = !activeDigest;
  $("digestPrevious").hidden = !activeDigest || !previous;
  $("digestSections").replaceChildren();
  if (!activeDigest) return;
  renderDigestSections(activeDigest);
  $("digestSummary").textContent = activeDigest.summaryZh;
  $("digestTone").textContent = activeDigest.toneZh ? `语气：${activeDigest.toneZh}` : "";
  $("digestPoints").replaceChildren(...(activeDigest.keyPointsZh || []).map((point) => {
    const item = document.createElement("li");
    item.textContent = point;
    return item;
  }));
  renderReadingMode();
}

function renderDigestSections(value) {
  const post = activePost;
  if (!post || !XDG_LONG_READING.validSections(value, post.text)) return;
  for (const section of value.sections) {
    const item = document.createElement("section");
    item.className = "digest-section";
    const title = document.createElement("h3");
    title.textContent = section.titleZh;
    const synopsis = document.createElement("p");
    synopsis.className = "section-synopsis";
    synopsis.textContent = section.summaryZh;
    const jump = document.createElement("button");
    jump.type = "button";
    jump.className = "secondary";
    jump.textContent = "回到全文位置";
    jump.addEventListener("click", () => {
      activeLongSectionId = section.id;
      readingMode = "original";
      renderReadingMode();
      requestAnimationFrame(() => {
        const target = $("postText").querySelector(`[data-long-section-id="${section.id}"]`);
        if (!target) return;
        $("readingViewport").scrollTo({ top: Math.max(0, target.offsetTop - 12) });
        $("readingShell").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    item.append(title, synopsis, jump);
    $("digestSections").append(item);
  }
}

function assessmentLabel(value) {
  return {
    as_is: "Correct · 正确自然",
    corrected: "Corrected · 已修正",
    uncertain: "Uncertain · 待确认",
    unassessed: "Not assessed · 未评估",
  }[value] || "Not assessed · 未评估";
}

function textDiffers(left, right) {
  return XDG_LEARNING_DATA.cleanText(left).toLocaleLowerCase("en-US") !==
    XDG_LEARNING_DATA.cleanText(right).toLocaleLowerCase("en-US");
}

function setExplanationLoading(loading) {
  $("explanationLoading").hidden = !loading;
  document.querySelectorAll(".explanation-result-content").forEach((node) => {
    node.hidden = loading;
  });
}

function renderExplanationLoading(selection) {
  activeExplanation = null;
  $("explanationOverlay").hidden = false;
  $("explanationTitle").textContent = `${selection.slice(0, 200)}${selection.length > 200 ? "…" : ""}`;
  $("explanationPronunciation").textContent = "";
  $("explanationType").textContent = "";
  $("explanationAssessment").textContent = "";
  $("wordbookSaveStatus").textContent = "";
  setExplanationLoading(true);
}

function renderExplanation(value) {
  activeExplanation = value ? XDG_LEARNING_DATA.normalizeStoredExplanation(value) : null;
  $("explanationOverlay").hidden = !activeExplanation;
  $("wordbookSaveStatus").textContent = "";
  if (!activeExplanation) return;
  setExplanationLoading(false);
  $("addWordbookButton").disabled = false;
  $("addWordbookButton").textContent = "Add to Wordbook";
  $("explanationTitle").textContent = activeExplanation.learningForm || activeExplanation.rawSelectedText;
  $("explanationPronunciation").textContent = activeExplanation.pronunciation;
  $("explanationType").textContent = activeExplanation.type;
  $("explanationAssessment").textContent = assessmentLabel(activeExplanation.assessment);
  $("explanationAssessment").dataset.assessment = activeExplanation.assessment;
  $("assessmentEnglish").textContent = activeExplanation.assessmentEn;
  $("assessmentChinese").textContent = activeExplanation.assessmentZh;
  const correctedSelection = activeExplanation.assessment === "corrected" &&
    textDiffers(activeExplanation.rawSelectedText, activeExplanation.learningForm);
  $("rawSelectionRow").hidden = !correctedSelection;
  $("rawSelection").textContent = activeExplanation.rawSelectedText;
  $("explanationMeaning").textContent = activeExplanation.meaningZh;
  $("explanationEnglish").textContent = activeExplanation.explanationEn;
  $("explanationUsage").hidden = !activeExplanation.usageZh;
  $("explanationUsage").textContent = activeExplanation.usageZh ? `Usage: ${activeExplanation.usageZh}` : "";
  $("exampleEn").textContent = activeExplanation.exampleEn;
  $("exampleZh").textContent = activeExplanation.exampleZh;
}

function clearSelectionState() {
  selectedText = "";
  selectedRange = null;
  $("selectionToolbar").hidden = true;
  $("selectionToolbar").style.removeProperty("left");
  $("selectionToolbar").style.removeProperty("top");
  window.getSelection()?.removeAllRanges();
}

function closeExplanation() {
  explanationRequestId += 1;
  renderExplanation(null);
  clearSelectionState();
}

async function persistReaderPosition(postId, scrollY) {
  if (!postId) return;
  const stored = await chrome.storage.local.get(READER_POSITIONS_KEY);
  const positions = XDG_READER_STATE.updatePosition(
    stored[READER_POSITIONS_KEY],
    postId,
    scrollY,
  );
  await chrome.storage.local.set({ [READER_POSITIONS_KEY]: positions });
}

function saveCurrentReaderPosition() {
  if (!activePost?.id || currentView !== "reader" || suppressReaderPositionSave) return;
  void persistReaderPosition(activePost.id, $("readingViewport").scrollTop);
}

async function restoreReaderPosition(postId) {
  const requestId = ++readerPositionRequestId;
  suppressReaderPositionSave = true;
  $("readingViewport").scrollTop = 0;
  const stored = await chrome.storage.local.get(READER_POSITIONS_KEY);
  const position = XDG_READER_STATE.positionFor(stored[READER_POSITIONS_KEY], postId);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (requestId !== readerPositionRequestId || activePost?.id !== postId || currentView !== "reader") return;
    $("readingViewport").scrollTo({ top: position });
    suppressReaderPositionSave = false;
  }));
}

function scheduleReaderPositionSave() {
  if (suppressReaderPositionSave || currentView !== "reader" || !activePost?.id) return;
  clearTimeout(readerPositionSaveTimer);
  readerPositionSaveTimer = setTimeout(saveCurrentReaderPosition, 250);
}

function trackLongReadingSection() {
  if (!hasLongReadingSections()) return;
  const visible = visibleLongSectionId();
  if (!visible || visible === activeLongSectionId) return;
  activeLongSectionId = visible;
  $("postText").querySelectorAll("[data-long-section-id]").forEach((node) => {
    node.dataset.active = String(node.dataset.longSectionId === activeLongSectionId);
  });
}

function render(post) {
  saveCurrentReaderPosition();
  explanationRequestId += 1;
  activePost = post || null;
  translationRequestId += 1;
  digestRequestId += 1;
  translationPending = false;
  sectionTranslationPending = "";
  activeLongSectionId = "";
  activeTranslation = null;
  activeDigest = null;
  activeExplanation = null;
  selectedText = "";
  selectedRange = null;
  $("emptyState").hidden = !!activePost;
  $("postCard").hidden = !activePost;
  if (!activePost) return;
  $("author").textContent = [post.authorName, post.handle].filter(Boolean).join(" ");
  $("postText").textContent = post.text;
  const isLong = post.text.length > XDG_LONG_READING.THRESHOLD;
  $("longReadingNotice").hidden = !isLong;
  $("digestButton").textContent = isLong ? (post.textTruncated ? "生成已载入部分摘要" : "生成全文摘要") : "Summarize";
  $("sourceCoverage").hidden = !post.textTruncated;
  $("sourceCoverage").textContent = post.textTruncated
    ? "内容超过长度上限，当前仅载入前 100,000 字符；摘要、翻译和收藏仅涵盖这部分。"
    : "";
  $("sourceLink").href = post.url;
  $("selectionToolbar").hidden = true;
  $("selectionToolbar").style.removeProperty("left");
  $("selectionToolbar").style.removeProperty("top");
  $("selectionHint").textContent = "Select English to Explain, or press N to save the selected excerpt.";
  setStatus("");

  const cached = collections.cache?.[post.id] || {};
  renderTranslation(cached.translation || null);
  renderDigest(cached.digest?.sourceText === post.text ? cached.digest : null);
  renderExplanation(null);
  renderReadingMode();
  void restoreReaderPosition(post.id);
}

function collectionEmpty(message) {
  const node = document.createElement("p");
  node.className = "empty-state";
  node.textContent = message;
  return node;
}

function createDeleteButton(action, payload) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "danger text-button";
  button.textContent = "Remove";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try { await send(action, payload); await loadCollections(); }
    catch (_) { button.disabled = false; }
  });
  return button;
}

function appendHighlightedText(node, value, query) {
  const text = typeof value === "string" ? value : "";
  const matches = XDG_LEARNING_DATA.findLiteralMatches(text, query);
  if (!matches.length) {
    node.textContent = text;
    return;
  }
  const parts = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) parts.push(document.createTextNode(text.slice(cursor, match.start)));
    const mark = document.createElement("mark");
    mark.className = "search-highlight";
    mark.textContent = text.slice(match.start, match.end);
    parts.push(mark);
    cursor = match.end;
  }
  if (cursor < text.length) parts.push(document.createTextNode(text.slice(cursor)));
  node.replaceChildren(...parts);
}

function updateSearchSummary(kind, query, shown, total) {
  const prefix = kind === "library" ? "Library" : "Wordbook";
  $(`${kind}SearchClear`).hidden = !query;
  $(`${kind}SearchCount`).textContent = query
    ? `${shown} of ${total} ${prefix} records match “${query}”.`
    : `${total} ${prefix} record${total === 1 ? "" : "s"}.`;
}

function digestSearchContext(post, query) {
  if (!query || !post?.digest || typeof post.digest !== "object") return "";
  const fields = [
    post.digest.summaryZh,
    post.digest.toneZh,
    ...(Array.isArray(post.digest.keyPointsZh) ? post.digest.keyPointsZh : []),
  ].filter((value) => XDG_LEARNING_DATA.findLiteralMatches(value, query).length);
  return fields.join(" · ");
}

function renderCollections() {
  $("libraryCount").textContent = String(collections.posts.length);
  $("wordbookCount").textContent = String(collections.entries.length);

  const matchingPosts = collections.posts.filter((post) => (
    XDG_LEARNING_DATA.collectionMatchesQuery("library", post, librarySearchQuery)
  ));
  updateSearchSummary("library", librarySearchQuery, matchingPosts.length, collections.posts.length);
  const libraryNodes = matchingPosts.map((post) => {
    const card = document.createElement("article");
    card.className = "collection-card";
    const author = document.createElement("strong");
    appendHighlightedText(author, [post.authorName, post.handle].filter(Boolean).join(" ") || "Unknown author", librarySearchQuery);
    const kind = document.createElement("span");
    kind.className = "badge library-kind";
    kind.textContent = post.kind === "excerpt" ? "Excerpt" : "Post";
    const text = document.createElement("p");
    text.className = "library-original";
    appendHighlightedText(text, post.text, librarySearchQuery);
    const translation = document.createElement("p");
    translation.className = "library-translation";
    appendHighlightedText(translation, post.translationZh || "", librarySearchQuery);
    translation.hidden = !post.translationZh;
    const matchedDigest = digestSearchContext(post, librarySearchQuery);
    const searchContext = document.createElement("p");
    searchContext.className = "search-match-context";
    appendHighlightedText(searchContext, matchedDigest, librarySearchQuery);
    searchContext.hidden = !matchedDigest;
    const controls = document.createElement("div");
    controls.className = "card-controls";
    const open = document.createElement("a");
    Object.assign(open, { href: post.url, target: "_blank", rel: "noreferrer" });
    open.textContent = post.kind === "excerpt" ? "Open at excerpt" : "Open on X";
    if (post.kind === "excerpt") open.addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        await chrome.storage.local.set({
          [SOURCE_FOCUS_KEY]: {
            statusId: post.id,
            excerpt: post.text,
            sourceText: post.sourceText || "",
            expiresAt: Date.now() + 2 * 60 * 1000,
          },
        });
      } catch (error) {
        setStatus(`Precise excerpt positioning is unavailable: ${error.message}`, true);
      }
      try {
        await chrome.tabs.create({ url: post.url });
      } catch (error) {
        setStatus(`Could not open the source: ${error.message}`, true);
      }
    });
    controls.append(open, createDeleteButton("deleteSavedPost", { recordId: post.recordId }));
    card.append(author, kind, text, translation, searchContext, controls);
    return card;
  });
  const libraryEmpty = librarySearchQuery ? `No Library matches for “${librarySearchQuery}”.` : "No saved posts yet.";
  $("libraryList").replaceChildren(...(libraryNodes.length ? libraryNodes : [collectionEmpty(libraryEmpty)]));

  const matchingEntries = collections.entries.filter((entry) => (
    XDG_LEARNING_DATA.collectionMatchesQuery("wordbook", entry, wordbookSearchQuery)
  ));
  updateSearchSummary("wordbook", wordbookSearchQuery, matchingEntries.length, collections.entries.length);
  const wordbookNodes = matchingEntries.map((entry) => {
    const explanationValue = XDG_LEARNING_DATA.normalizeStoredExplanation(entry);
    const card = document.createElement("article");
    card.className = "collection-card wordbook-card";
    const heading = document.createElement("div");
    heading.className = "wordbook-heading";
    const term = document.createElement("div");
    term.className = "wordbook-term";
    const title = document.createElement("strong");
    appendHighlightedText(title, explanationValue.learningForm || explanationValue.rawSelectedText || "Untitled expression", wordbookSearchQuery);
    const pronunciation = document.createElement("span");
    pronunciation.className = "pronunciation";
    appendHighlightedText(pronunciation, explanationValue.pronunciation, wordbookSearchQuery);
    term.append(title, pronunciation);
    const badges = document.createElement("div");
    badges.className = "term-badges";
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = explanationValue.type;
    const assessment = document.createElement("span");
    assessment.className = "assessment-badge";
    assessment.dataset.assessment = explanationValue.assessment;
    assessment.textContent = assessmentLabel(explanationValue.assessment);
    badges.append(badge, assessment);
    heading.append(term, badges);
    const raw = document.createElement("p");
    raw.className = "raw-selection";
    appendHighlightedText(raw, `Selected: ${explanationValue.rawSelectedText}`, wordbookSearchQuery);
    raw.hidden = explanationValue.assessment !== "corrected" ||
      !textDiffers(explanationValue.rawSelectedText, explanationValue.learningForm);
    const meaning = document.createElement("p");
    meaning.className = "wordbook-meaning";
    appendHighlightedText(meaning, explanationValue.meaningZh, wordbookSearchQuery);
    const explanation = document.createElement("p");
    explanation.className = "wordbook-explanation muted";
    appendHighlightedText(explanation, explanationValue.explanationEn, wordbookSearchQuery);
    const usage = document.createElement("p");
    usage.className = "usage-note";
    appendHighlightedText(usage, explanationValue.usageZh ? `Usage: ${explanationValue.usageZh}` : "", wordbookSearchQuery);
    usage.hidden = !explanationValue.usageZh;
    const example = document.createElement("div");
    example.className = "example-card compact";
    const exampleEn = document.createElement("div");
    appendHighlightedText(exampleEn, explanationValue.exampleEn, wordbookSearchQuery);
    const exampleZh = document.createElement("div");
    exampleZh.className = "muted";
    appendHighlightedText(exampleZh, explanationValue.exampleZh, wordbookSearchQuery);
    example.append(exampleEn, exampleZh);
    example.hidden = !explanationValue.exampleEn && !explanationValue.exampleZh;
    const controls = document.createElement("div");
    controls.className = "card-controls";
    const source = document.createElement("a");
    Object.assign(source, { href: entry.sourceUrl, target: "_blank", rel: "noreferrer", textContent: "Source" });
    controls.append(source, createDeleteButton("deleteWordbookEntry", { recordId: entry.recordId }));
    card.append(heading, raw, meaning, explanation, usage, example, controls);
    return card;
  });
  const wordbookEmpty = wordbookSearchQuery ? `No Wordbook matches for “${wordbookSearchQuery}”.` : "No Wordbook entries yet.";
  $("wordbookList").replaceChildren(...(wordbookNodes.length ? wordbookNodes : [collectionEmpty(wordbookEmpty)]));
}

async function loadCollections() {
  const result = await send("getCollections");
  collections = { posts: result.posts, entries: result.entries, cache: result.cache };
  renderCollections();
  const warning = XDG_LEARNING_DATA.storageWarning({
    usedBytes: result.storageBytesInUse,
    quotaBytes: result.storageQuotaBytes,
    libraryCount: collections.posts.length,
    wordbookCount: collections.entries.length,
  });
  $("storageNotice").textContent = warning;
  $("storageNotice").hidden = !warning;
}

async function loadActivePost() {
  const result = await chrome.storage.local.get("xdg_active_post");
  render(result.xdg_active_post);
}

async function loadConfigStatus() {
  const config = await send("getConfigStatus");
  $("configNotice").hidden = config.hasApiKey;
  $("configNotice").textContent = config.hasApiKey ? "" : "Add a DeepSeek API key in Settings to use Chinese/bilingual reading, Summarize, and Explain. Saving and exports still work without it.";
}

async function translateActivePost() {
  if (!activePost || translationPending) return;
  const post = activePost;
  const requestId = ++translationRequestId;
  translationPending = true;
  renderTranslationLoading();
  setStatus("Translating this post…");
  try {
    const result = await send("translatePost", { post });
    if (requestId !== translationRequestId || activePost?.id !== post.id || activePost?.text !== post.text) return;
    renderTranslation(result.value);
    collections.cache[post.id] = { ...(collections.cache[post.id] || {}), translation: result.value };
    renderReadingMode();
    setStatus(result.cached ? "Loaded cached translation." : "Translation ready.");
  } catch (error) {
    if (requestId !== translationRequestId || activePost?.id !== post.id || activePost?.text !== post.text) return;
    readingMode = "original";
    renderReadingMode();
    setStatus(error.message, true);
  } finally {
    if (requestId === translationRequestId) translationPending = false;
  }
}

async function digestActivePost() {
  if (!activePost) return;
  const post = activePost;
  const requestId = ++digestRequestId;
  const button = $("digestButton");
  setBusy(button, true, "Summarizing…");
  setStatus("Creating a short summary…");
  try {
    const result = await send("digestPost", { post });
    if (requestId !== digestRequestId || activePost?.id !== post.id || activePost?.text !== post.text) return;
    renderDigest(result.value);
    collections.cache[post.id] = { ...(collections.cache[post.id] || {}), digest: result.value };
    setStatus(result.cached ? "Loaded cached summary." : "Summary ready.");
  } catch (error) {
    if (requestId !== digestRequestId || activePost?.id !== post.id || activePost?.text !== post.text) return;
    if (activeDigest) renderDigest(activeDigest, { previous: true });
    setStatus(error.message, true);
  }
  finally { setBusy(button, false); }
}

async function explainSelection() {
  if (!activePost || !selectedText) return;
  const requestId = ++explanationRequestId;
  const button = $("explainButton");
  $("selectionToolbar").hidden = true;
  window.getSelection()?.removeAllRanges();
  setBusy(button, true, "Explaining…");
  renderExplanationLoading(selectedText);
  setStatus(`Explaining “${selectedText.slice(0, 80)}”…`);
  try {
    const result = await send("explainSelection", { post: activePost, selectedText });
    if (requestId !== explanationRequestId) return;
    renderExplanation(result.value);
    setStatus("Explanation ready.");
  } catch (error) {
    if (requestId !== explanationRequestId) return;
    $("explanationOverlay").hidden = true;
    $("selectionToolbar").hidden = false;
    positionSelectionToolbar();
    setStatus(error.message, true);
  }
  finally { setBusy(button, false); }
}

function captureSelection() {
  const selection = window.getSelection();
  const text = XDG_LEARNING_DATA.cleanText(selection?.toString(), XDG_LEARNING_DATA.LIMITS.excerptText);
  if (!text || !selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  const inOriginal = $("postText").contains(range.commonAncestorContainer)
    || [...document.querySelectorAll(".section-original")].some(node => node.contains(range.commonAncestorContainer));
  const inBilingual = $("bilingualBlock").contains(range.commonAncestorContainer);
  const normalizedPost = activePost?.text?.replace(/\s+/g, " ") || "";
  if ((!inOriginal && !inBilingual) || !normalizedPost.includes(text.replace(/\s+/g, " "))) return;
  selectedText = text;
  selectedRange = range.cloneRange();
  $("selectionPreview").textContent = `“${text.slice(0, 100)}${text.length > 100 ? "…" : ""}”`;
  $("selectionToolbar").hidden = false;
  positionSelectionToolbar();
}

async function saveSelectedExcerpt() {
  if (!activePost || !selectedText || excerptSavePending) return;
  excerptSavePending = true;
  const selectionAtStart = selectedText;
  const preview = $("selectionPreview");
  const explainButton = $("explainButton");
  preview.textContent = "Saving bilingual excerpt…";
  setBusy(explainButton, true, "Saving…");
  setStatus("Saving selected excerpt…");
  try {
    const result = await send("saveExcerpt", { post: activePost, selectedText });
    preview.textContent = result.translationError ? "Excerpt saved · translation unavailable" : "Saved to Library ✓";
    setStatus(result.translationError
      ? `Excerpt saved, but Chinese translation is unavailable: ${result.translationError}`
      : result.updated ? "This bilingual excerpt is already in your Library." : "Bilingual excerpt saved to Library.",
      !!result.translationError);
    await loadCollections();
  } catch (error) {
    preview.textContent = `“${selectionAtStart.slice(0, 100)}${selectionAtStart.length > 100 ? "…" : ""}”`;
    setStatus(error.message, true);
  } finally {
    excerptSavePending = false;
    setBusy(explainButton, false);
  }
}

function positionSelectionToolbar() {
  const toolbar = $("selectionToolbar");
  if (!selectedRange || toolbar.hidden) return;
  const selectionRect = selectedRange.getBoundingClientRect();
  if (!selectionRect.width && !selectionRect.height) {
    toolbar.hidden = true;
    return;
  }
  const toolbarRect = toolbar.getBoundingClientRect();
  const position = XDG_UI_GEOMETRY.positionNearSelection(
    selectionRect,
    toolbarRect,
    { width: window.innerWidth, height: window.innerHeight },
  );
  toolbar.style.left = `${position.left}px`;
  toolbar.style.top = `${position.top}px`;
  toolbar.dataset.placement = position.placement;
}

function downloadMarkdown(filename, content) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportActiveDigestMarkdown() {
  if (!activePost || !activeDigest) return;
  const markdown = XDG_LONG_READING.articleToMarkdown(activePost, activeDigest);
  const base = XDG_LEARNING_DATA.markdownTitle(activePost.text, 60)
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim() || `x-article-${activePost.id}`;
  downloadMarkdown(`${base}.md`, markdown);
  setStatus("Markdown 已导出，包含摘要和完整原文。");
}

function downloadJson(filename, backup) {
  const blob = new Blob([XDG_BACKUP_DATA.stringifyBackup(backup)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function backupFilename(prefix = "x-digest-backup") {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
}

async function exportJsonBackup(filename = backupFilename()) {
  const result = await send("exportJsonBackup");
  downloadJson(filename, result.backup);
  return result;
}

async function restoreJsonFile(file) {
  if (!file) return;
  if (file.size > 12 * 1024 * 1024) throw new Error("Choose an X Digest JSON backup smaller than 12 MB.");
  const backup = XDG_BACKUP_DATA.parseBackup(await file.text());
  const { library, wordbook } = backup.data;
  const confirmed = window.confirm(
    `Merge ${library.length} Library and ${wordbook.length} Wordbook records into this Chrome profile?\n\n` +
    "Existing matching IDs will be updated. Other local records will remain, and a safety backup will download first.",
  );
  if (!confirmed) return;
  await exportJsonBackup(backupFilename("x-digest-before-restore"));
  const result = await send("restoreJsonBackup", { backup });
  await loadCollections();
  $("backupStatus").textContent = `Restore complete: ${result.libraryCount} Library and ${result.wordbookCount} Wordbook records. API Key was not changed.`;
}

function switchView(viewName) {
  if (currentView === "reader" && viewName !== "reader") saveCurrentReaderPosition();
  currentView = viewName;
  document.querySelectorAll(".view").forEach((view) => { view.hidden = view.id !== `${viewName}View`; });
  document.querySelectorAll(".tab-button").forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
  if (viewName === "reader" && activePost?.id) void restoreReaderPosition(activePost.id);
}

function setupCollectionSearch(kind) {
  const input = $(`${kind}SearchInput`);
  const clear = $(`${kind}SearchClear`);
  const applyQuery = () => {
    const query = XDG_LEARNING_DATA.cleanText(input.value, 200);
    if (kind === "library") librarySearchQuery = query;
    else wordbookSearchQuery = query;
    renderCollections();
  };
  input.addEventListener("input", applyQuery);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    input.value = "";
    applyQuery();
  });
  clear.addEventListener("click", () => {
    input.value = "";
    applyQuery();
    input.focus();
  });
}

document.querySelectorAll(".tab-button").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
setupCollectionSearch("library");
setupCollectionSearch("wordbook");
document.querySelectorAll(".mode-button").forEach((button) => button.addEventListener("click", () => {
  const sectionId = activeLongSectionId;
  readingMode = button.dataset.mode;
  renderReadingMode();
  requestAnimationFrame(() => {
    const target = $("postText").querySelector(`[data-long-section-id="${sectionId}"]`);
    if (target) $("readingViewport").scrollTo({ top: Math.max(0, target.offsetTop - 12) });
  });
}));
$("settingsButton").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("digestButton").addEventListener("click", digestActivePost);
$("exportDigestMarkdown").addEventListener("click", exportActiveDigestMarkdown);
$("explainButton").addEventListener("click", explainSelection);
$("closeExplanationButton").addEventListener("click", closeExplanation);
$("explanationOverlay").addEventListener("click", (event) => {
  if (event.target === $("explanationOverlay")) closeExplanation();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("explanationOverlay").hidden) closeExplanation();
  const target = event.target;
  const isEditable = target instanceof HTMLElement && (
    target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
  if (event.key.toLowerCase() === "n" && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey && !isEditable && $("explanationOverlay").hidden && selectedText) {
    event.preventDefault();
    saveSelectedExcerpt();
  }
});
$("postText").addEventListener("mouseup", captureSelection);
$("postText").addEventListener("keyup", captureSelection);
$("bilingualBlock").addEventListener("mouseup", captureSelection);
$("bilingualBlock").addEventListener("keyup", captureSelection);
window.addEventListener("resize", positionSelectionToolbar);
window.addEventListener("scroll", positionSelectionToolbar, true);
$("readingViewport").addEventListener("scroll", () => {
  trackLongReadingSection();
  scheduleReaderPositionSave();
}, { passive: true });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveCurrentReaderPosition();
});
$("saveButton").addEventListener("click", async () => {
  if (!activePost) return;
  const button = $("saveButton");
  setBusy(button, true, "Saving…");
  setStatus(activePost.text.length > XDG_LONG_READING.THRESHOLD ? "正在保存全文…" : "Translating and saving this post…");
  try {
    const result = await send("savePost", { post: activePost });
    if (result.translation) {
      renderTranslation(result.translation);
      collections.cache[activePost.id] = { ...(collections.cache[activePost.id] || {}), translation: result.translation };
    }
    setStatus(result.originalOnly ? "全文已保存；可在摘要中按需翻译本节。" : result.translationError
      ? `Post saved, but Chinese translation is unavailable: ${result.translationError}`
      : result.updated ? "Bilingual saved post updated." : "Bilingual post saved locally.",
      !!result.translationError);
    await loadCollections();
  } catch (error) { setStatus(error.message, true); }
  finally { setBusy(button, false); }
});
$("addWordbookButton").addEventListener("click", async () => {
  if (!activePost || !activeExplanation) return;
  const button = $("addWordbookButton");
  button.disabled = true;
  button.textContent = "Saving…";
  $("wordbookSaveStatus").textContent = "";
  try {
    const result = await send("saveWordbook", { post: activePost, explanation: activeExplanation });
    button.textContent = result.updated ? "Already saved" : "Saved";
    $("wordbookSaveStatus").textContent = result.updated
      ? "This expression already exists in this post context."
      : "Added to your Wordbook.";
    setStatus(result.updated ? "Wordbook record already existed." : "Added to Wordbook.");
    loadCollections().catch(() => {});
  } catch (error) {
    button.disabled = false;
    button.textContent = "Try again";
    $("wordbookSaveStatus").textContent = error.message;
    setStatus(error.message, true);
  }
});
$("exportLibraryButton").addEventListener("click", () => downloadMarkdown("x-digest-library.md", XDG_LEARNING_DATA.libraryToMarkdown(collections.posts)));
$("exportWordbookButton").addEventListener("click", () => downloadMarkdown("x-digest-wordbook.md", XDG_LEARNING_DATA.wordbookToMarkdown(collections.entries)));
$("exportSnapshotButton").addEventListener("click", () => downloadMarkdown("x-digest-complete-snapshot.md", XDG_LEARNING_DATA.completeSnapshotToMarkdown(collections.posts, collections.entries)));
$("exportJsonButton").addEventListener("click", async () => {
  $("backupStatus").textContent = "Preparing JSON backup…";
  try {
    const result = await exportJsonBackup();
    $("backupStatus").textContent = result.skippedCacheCount
      ? `JSON backup downloaded. ${result.skippedCacheCount} incompatible legacy AI cache ${result.skippedCacheCount === 1 ? "entry was" : "entries were"} skipped; Library and Wordbook are complete. API Key was not included.`
      : "JSON backup downloaded. API Key was not included.";
  } catch (error) {
    $("backupStatus").textContent = error.message;
  }
});
$("restoreJsonButton").addEventListener("click", () => $("restoreJsonInput").click());
$("restoreJsonInput").addEventListener("change", async (event) => {
  $("backupStatus").textContent = "Checking backup…";
  try { await restoreJsonFile(event.target.files?.[0]); }
  catch (error) { $("backupStatus").textContent = error.message; }
  finally { event.target.value = ""; }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.xdg_active_post) { switchView("reader"); render(changes.xdg_active_post.newValue); }
});

Promise.all([loadCollections(), loadConfigStatus()]).then(loadActivePost).catch((error) => setStatus(error.message, true));

chrome.runtime.onMessage.addListener((message) => {
  if (message?.action === "longReadingProgress" && activePost?.id === message.postId
      && activePost?.text === message.sourceText && $("digestButton").disabled) {
    setStatus(message.message);
  }
});
