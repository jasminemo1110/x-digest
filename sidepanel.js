"use strict";

let activePost = null;
let activeTranslation = null;
let activeDigest = null;
let activeExplanation = null;
let selectedText = "";
let collections = { posts: [], entries: [], cache: {} };
let readingMode = "original";
let translationPending = false;

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
  $("originalBlock").hidden = readingMode === "chinese";
  $("translationBlock").hidden = readingMode === "original" || !hasTranslation;
  document.querySelectorAll(".mode-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === readingMode);
  });
  if (readingMode !== "original" && !hasTranslation) translateActivePost();
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

function renderExplanation(value) {
  activeExplanation = value || null;
  $("explanationOverlay").hidden = !activeExplanation;
  if (!activeExplanation) return;
  $("explanationTitle").textContent = activeExplanation.selectedText;
  $("explanationType").textContent = activeExplanation.type;
  $("explanationMeaning").textContent = activeExplanation.meaningZh;
  $("explanationEnglish").textContent = activeExplanation.explanationEn;
  $("learningForm").textContent = activeExplanation.learningForm;
  $("exampleEn").textContent = activeExplanation.exampleEn;
  $("exampleZh").textContent = activeExplanation.exampleZh;
}

function render(post) {
  activePost = post || null;
  activeTranslation = null;
  activeDigest = null;
  activeExplanation = null;
  selectedText = "";
  $("emptyState").hidden = !!activePost;
  $("postCard").hidden = !activePost;
  if (!activePost) return;
  $("author").textContent = [post.authorName, post.handle].filter(Boolean).join(" ");
  $("postText").textContent = post.text;
  $("sourceLink").href = post.url;
  $("selectionToolbar").hidden = true;
  $("selectionHint").textContent = "Select a word, phrase, or sentence to explain it.";
  setStatus("");

  const cached = collections.cache?.[post.id] || {};
  activeTranslation = cached.translation || null;
  $("translationText").textContent = activeTranslation?.translationZh || "";
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
    const text = document.createElement("p");
    text.textContent = post.text;
    const controls = document.createElement("div");
    controls.className = "card-controls";
    const open = document.createElement("a");
    Object.assign(open, { href: post.url, target: "_blank", rel: "noreferrer", textContent: "Open on X" });
    controls.append(open, createDeleteButton("deleteSavedPost", { id: post.id }));
    card.append(author, text, controls);
    return card;
  });
  $("libraryList").replaceChildren(...(libraryNodes.length ? libraryNodes : [collectionEmpty("No saved posts yet.")]));

  const wordbookNodes = collections.entries.map((entry) => {
    const card = document.createElement("article");
    card.className = "collection-card";
    const heading = document.createElement("div");
    heading.className = "result-heading";
    const title = document.createElement("strong");
    title.textContent = entry.learningForm || entry.selectedText;
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = entry.type || "expression";
    heading.append(title, badge);
    const meaning = document.createElement("p");
    meaning.textContent = entry.meaningZh;
    const explanation = document.createElement("p");
    explanation.className = "muted";
    explanation.textContent = entry.explanationEn;
    const controls = document.createElement("div");
    controls.className = "card-controls";
    const source = document.createElement("a");
    Object.assign(source, { href: entry.sourceUrl, target: "_blank", rel: "noreferrer", textContent: "Source" });
    controls.append(source, createDeleteButton("deleteWordbookEntry", { recordId: entry.recordId }));
    card.append(heading, meaning, explanation, controls);
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
    activeTranslation = result.value;
    $("translationText").textContent = activeTranslation.translationZh;
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
  setBusy(button, true, "Explaining…");
  setStatus(`Explaining “${selectedText.slice(0, 80)}”…`);
  try {
    const result = await send("explainSelection", { post: activePost, selectedText });
    renderExplanation(result.value);
    setStatus("Explanation ready.");
  } catch (error) { setStatus(error.message, true); }
  finally { setBusy(button, false); }
}

function captureSelection() {
  const selection = window.getSelection();
  const text = XDG_LEARNING_DATA.cleanText(selection?.toString(), XDG_LEARNING_DATA.LIMITS.selectedText);
  if (!text || !selection?.rangeCount || !$("postText").contains(selection.getRangeAt(0).commonAncestorContainer)) return;
  selectedText = text;
  $("selectionPreview").textContent = `“${text.slice(0, 100)}${text.length > 100 ? "…" : ""}”`;
  $("selectionToolbar").hidden = false;
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
$("closeExplanationButton").addEventListener("click", () => renderExplanation(null));
$("explanationOverlay").addEventListener("click", (event) => {
  if (event.target === $("explanationOverlay")) renderExplanation(null);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("explanationOverlay").hidden) renderExplanation(null);
});
$("postText").addEventListener("mouseup", captureSelection);
$("postText").addEventListener("keyup", captureSelection);
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
  try {
    const result = await send("saveWordbook", { post: activePost, explanation: activeExplanation });
    setStatus(result.updated ? "Wordbook record updated." : "Added to Wordbook.");
    await loadCollections();
  } catch (error) { setStatus(error.message, true); }
});
$("exportLibraryButton").addEventListener("click", () => downloadMarkdown("x-digest-library.md", XDG_LEARNING_DATA.libraryToMarkdown(collections.posts)));
$("exportWordbookButton").addEventListener("click", () => downloadMarkdown("x-digest-wordbook.md", XDG_LEARNING_DATA.wordbookToMarkdown(collections.entries)));
$("exportSnapshotButton").addEventListener("click", () => downloadMarkdown("x-digest-complete-snapshot.md", XDG_LEARNING_DATA.completeSnapshotToMarkdown(collections.posts, collections.entries)));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.xdg_active_post) { switchView("reader"); render(changes.xdg_active_post.newValue); }
});

Promise.all([loadCollections(), loadConfigStatus()]).then(loadActivePost).catch((error) => setStatus(error.message, true));
