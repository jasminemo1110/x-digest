"use strict";

let activePost = null;
let activeTranslation = null;
let activeDigest = null;
let activeExplanation = null;
let selectedText = "";
let collections = { posts: [], entries: [], cache: {} };
let readingMode = "original";
let translationPending = false;
let selectedRange = null;

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

function renderReadingMode() {
  const hasTranslation = !!activeTranslation?.translationZh;
  const hasAlignedTranslation = XDG_LEARNING_DATA.isAlignedTranslation(activeTranslation, activePost?.text);
  $("originalBlock").hidden = readingMode !== "original";
  $("translationBlock").hidden = readingMode !== "chinese" || !hasTranslation;
  $("bilingualBlock").hidden = readingMode !== "bilingual" || !hasAlignedTranslation;
  document.querySelectorAll(".mode-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === readingMode);
  });
  const translationNeeded = readingMode === "chinese" ? !hasTranslation :
    readingMode === "bilingual" ? !hasAlignedTranslation : false;
  if (translationNeeded) translateActivePost();
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

function renderDigest(value) {
  activeDigest = value || null;
  $("digestCard").hidden = !activeDigest;
  if (!activeDigest) return;
  $("digestSummary").textContent = activeDigest.summaryZh;
  $("digestTone").textContent = activeDigest.toneZh ? `语气：${activeDigest.toneZh}` : "";
  $("digestPoints").replaceChildren(...(activeDigest.keyPointsZh || []).map((point) => {
    const item = document.createElement("li");
    item.textContent = point;
    return item;
  }));
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

function renderExplanation(value) {
  activeExplanation = value ? XDG_LEARNING_DATA.normalizeStoredExplanation(value) : null;
  $("explanationOverlay").hidden = !activeExplanation;
  $("wordbookSaveStatus").textContent = "";
  if (!activeExplanation) return;
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
  renderExplanation(null);
  clearSelectionState();
}

function render(post) {
  activePost = post || null;
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
  $("sourceLink").href = post.url;
  $("selectionToolbar").hidden = true;
  $("selectionToolbar").style.removeProperty("left");
  $("selectionToolbar").style.removeProperty("top");
  $("selectionHint").textContent = "Select English to Explain, or press N to save the selected excerpt.";
  setStatus("");

  const cached = collections.cache?.[post.id] || {};
  renderTranslation(cached.translation || null);
  renderDigest(cached.digest || null);
  renderExplanation(null);
  renderReadingMode();
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

function renderCollections() {
  $("libraryCount").textContent = String(collections.posts.length);
  $("wordbookCount").textContent = String(collections.entries.length);

  const libraryNodes = collections.posts.map((post) => {
    const card = document.createElement("article");
    card.className = "collection-card";
    const author = document.createElement("strong");
    author.textContent = [post.authorName, post.handle].filter(Boolean).join(" ") || "Unknown author";
    const kind = document.createElement("span");
    kind.className = "badge library-kind";
    kind.textContent = post.kind === "excerpt" ? "Excerpt" : "Post";
    const text = document.createElement("p");
    text.textContent = post.text;
    const controls = document.createElement("div");
    controls.className = "card-controls";
    const open = document.createElement("a");
    Object.assign(open, { href: post.url, target: "_blank", rel: "noreferrer", textContent: "Open on X" });
    controls.append(open, createDeleteButton("deleteSavedPost", { recordId: post.recordId }));
    card.append(author, kind, text, controls);
    return card;
  });
  $("libraryList").replaceChildren(...(libraryNodes.length ? libraryNodes : [collectionEmpty("No saved posts yet.")]));

  const wordbookNodes = collections.entries.map((entry) => {
    const explanationValue = XDG_LEARNING_DATA.normalizeStoredExplanation(entry);
    const card = document.createElement("article");
    card.className = "collection-card wordbook-card";
    const heading = document.createElement("div");
    heading.className = "wordbook-heading";
    const term = document.createElement("div");
    term.className = "wordbook-term";
    const title = document.createElement("strong");
    title.textContent = explanationValue.learningForm || explanationValue.rawSelectedText || "Untitled expression";
    const pronunciation = document.createElement("span");
    pronunciation.className = "pronunciation";
    pronunciation.textContent = explanationValue.pronunciation;
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
    raw.textContent = `Selected: ${explanationValue.rawSelectedText}`;
    raw.hidden = explanationValue.assessment !== "corrected" ||
      !textDiffers(explanationValue.rawSelectedText, explanationValue.learningForm);
    const meaning = document.createElement("p");
    meaning.className = "wordbook-meaning";
    meaning.textContent = explanationValue.meaningZh;
    const explanation = document.createElement("p");
    explanation.className = "wordbook-explanation muted";
    explanation.textContent = explanationValue.explanationEn;
    const usage = document.createElement("p");
    usage.className = "usage-note";
    usage.textContent = explanationValue.usageZh ? `Usage: ${explanationValue.usageZh}` : "";
    usage.hidden = !explanationValue.usageZh;
    const example = document.createElement("div");
    example.className = "example-card compact";
    const exampleEn = document.createElement("div");
    exampleEn.textContent = explanationValue.exampleEn;
    const exampleZh = document.createElement("div");
    exampleZh.className = "muted";
    exampleZh.textContent = explanationValue.exampleZh;
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
  $("wordbookList").replaceChildren(...(wordbookNodes.length ? wordbookNodes : [collectionEmpty("No Wordbook entries yet.")]));
}

async function loadCollections() {
  const result = await send("getCollections");
  collections = { posts: result.posts, entries: result.entries, cache: result.cache };
  renderCollections();
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
  translationPending = true;
  setStatus("Translating this post…");
  try {
    const result = await send("translatePost", { post: activePost });
    renderTranslation(result.value);
    collections.cache[activePost.id] = { ...(collections.cache[activePost.id] || {}), translation: result.value };
    renderReadingMode();
    setStatus(result.cached ? "Loaded cached translation." : "Translation ready.");
  } catch (error) {
    readingMode = "original";
    renderReadingMode();
    setStatus(error.message, true);
  } finally { translationPending = false; }
}

async function digestActivePost() {
  if (!activePost) return;
  const button = $("digestButton");
  setBusy(button, true, "Summarizing…");
  setStatus("Creating a short summary…");
  try {
    const result = await send("digestPost", { post: activePost });
    renderDigest(result.value);
    collections.cache[activePost.id] = { ...(collections.cache[activePost.id] || {}), digest: result.value };
    setStatus(result.cached ? "Loaded cached summary." : "Summary ready.");
  } catch (error) { setStatus(error.message, true); }
  finally { setBusy(button, false); }
}

async function explainSelection() {
  if (!activePost || !selectedText) return;
  const button = $("explainButton");
  $("selectionToolbar").hidden = true;
  window.getSelection()?.removeAllRanges();
  setBusy(button, true, "Explaining…");
  setStatus(`Explaining “${selectedText.slice(0, 80)}”…`);
  try {
    const result = await send("explainSelection", { post: activePost, selectedText });
    renderExplanation(result.value);
    setStatus("Explanation ready.");
  } catch (error) {
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
  const inOriginal = $("postText").contains(range.commonAncestorContainer);
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
  if (!activePost || !selectedText) return;
  setStatus("Saving selected excerpt…");
  try {
    const result = await send("saveExcerpt", { post: activePost, selectedText });
    setStatus(result.updated ? "This excerpt is already in your Library." : "Selected excerpt saved to Library.");
    await loadCollections();
  } catch (error) {
    setStatus(error.message, true);
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

function switchView(viewName) {
  document.querySelectorAll(".view").forEach((view) => { view.hidden = view.id !== `${viewName}View`; });
  document.querySelectorAll(".tab-button").forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
}

document.querySelectorAll(".tab-button").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
document.querySelectorAll(".mode-button").forEach((button) => button.addEventListener("click", () => { readingMode = button.dataset.mode; renderReadingMode(); }));
$("settingsButton").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("digestButton").addEventListener("click", digestActivePost);
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
$("saveButton").addEventListener("click", async () => {
  if (!activePost) return;
  try {
    const result = await send("savePost", { post: activePost });
    setStatus(result.updated ? "Saved record updated." : "Saved locally.");
    await loadCollections();
  } catch (error) { setStatus(error.message, true); }
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

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.xdg_active_post) { switchView("reader"); render(changes.xdg_active_post.newValue); }
});

Promise.all([loadCollections(), loadConfigStatus()]).then(loadActivePost).catch((error) => setStatus(error.message, true));
