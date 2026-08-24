(function initLearningData(root) {
  "use strict";

  const LIMITS = Object.freeze({
    postText: 20000,
    selectedText: 500,
    shortText: 1000,
    explanation: 4000,
    entries: 1000,
  });

  const ENTRY_TYPES = new Set(["word", "phrase", "expression", "sentence"]);

  function cleanText(value, maxLength = LIMITS.shortText) {
    if (typeof value !== "string") return "";
    return value.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
  }

  function requiredText(value, field, maxLength) {
    const cleaned = cleanText(value, maxLength);
    if (!cleaned) throw new Error(`AI response is missing ${field}.`);
    return cleaned;
  }

  function normalizePost(value = {}) {
    const id = cleanText(value.id, 40);
    const text = cleanText(value.text, LIMITS.postText);
    if (!/^\d+$/.test(id) || !text) throw new Error("A valid X status ID and post text are required.");

    const rawUrl = cleanText(value.url, 1000);
    let url = "";
    try {
      const parsed = new URL(rawUrl);
      if (["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(parsed.hostname)) {
        url = parsed.href;
      }
    } catch (_) {}
    if (!url) throw new Error("A valid X post URL is required.");

    return {
      id,
      recordId: `x-post:${id}`,
      url,
      text,
      authorName: cleanText(value.authorName, 200),
      handle: cleanText(value.handle, 100),
      publishedAt: cleanText(value.publishedAt, 100),
      capturedAt: cleanText(value.capturedAt, 100),
    };
  }

  function validateTranslationPayload(value = {}) {
    return { translationZh: requiredText(value.translationZh, "translationZh", LIMITS.postText) };
  }

  function validateDigestPayload(value = {}) {
    const keyPoints = Array.isArray(value.keyPointsZh)
      ? value.keyPointsZh.map((item) => cleanText(item, 500)).filter(Boolean).slice(0, 5)
      : [];
    return {
      summaryZh: requiredText(value.summaryZh, "summaryZh", LIMITS.explanation),
      toneZh: cleanText(value.toneZh, 500),
      keyPointsZh: keyPoints,
    };
  }

  function inferEntryType(text) {
    const cleaned = cleanText(text, LIMITS.selectedText);
    if (/\s/.test(cleaned)) return /[.!?]$/.test(cleaned) ? "sentence" : "phrase";
    return "word";
  }

  function validateExplanationPayload(value = {}, fallbackSelection = "") {
    const selectedText = requiredText(
      value.selectedText || fallbackSelection,
      "selectedText",
      LIMITS.selectedText,
    );
    const rawType = cleanText(value.type, 30).toLowerCase();
    return {
      selectedText,
      type: ENTRY_TYPES.has(rawType) ? rawType : inferEntryType(selectedText),
      meaningZh: requiredText(value.meaningZh, "meaningZh", LIMITS.explanation),
      explanationEn: requiredText(value.explanationEn, "explanationEn", LIMITS.explanation),
      learningForm: requiredText(value.learningForm || selectedText, "learningForm", LIMITS.selectedText),
      exampleEn: requiredText(value.exampleEn, "exampleEn", LIMITS.explanation),
      exampleZh: requiredText(value.exampleZh, "exampleZh", LIMITS.explanation),
    };
  }

  function stableWordbookSource(postId, explanation) {
    return [
      "xdg-wordbook-v1",
      cleanText(postId, 40),
      cleanText(explanation.learningForm || explanation.selectedText, LIMITS.selectedText).toLocaleLowerCase("en-US"),
      cleanText(explanation.selectedText, LIMITS.selectedText).toLocaleLowerCase("en-US"),
    ].join("\n");
  }

  async function sha256Hex(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function createWordbookEntry(postValue, explanationValue, now = new Date().toISOString()) {
    const post = normalizePost(postValue);
    const explanation = validateExplanationPayload(explanationValue);
    const recordId = await sha256Hex(stableWordbookSource(post.id, explanation));
    return {
      recordId,
      ...explanation,
      sourcePostId: post.id,
      sourceText: post.text,
      sourceUrl: post.url,
      authorName: post.authorName,
      handle: post.handle,
      createdAt: now,
      updatedAt: now,
    };
  }

  function upsertByRecordId(entries, nextEntry, maxEntries = LIMITS.entries) {
    const safeEntries = Array.isArray(entries) ? entries.filter((entry) => entry?.recordId) : [];
    const index = safeEntries.findIndex((entry) => entry.recordId === nextEntry.recordId);
    if (index >= 0) {
      const merged = { ...safeEntries[index], ...nextEntry, createdAt: safeEntries[index].createdAt || nextEntry.createdAt };
      safeEntries.splice(index, 1);
      safeEntries.unshift(merged);
      return { entries: safeEntries.slice(0, maxEntries), entry: merged, updated: true };
    }
    safeEntries.unshift(nextEntry);
    return { entries: safeEntries.slice(0, maxEntries), entry: nextEntry, updated: false };
  }

  function escapeMarkdownCell(value) {
    return cleanText(value, LIMITS.explanation).replace(/\|/g, "\\|").replace(/\n/g, "<br>");
  }

  function postToMarkdown(postValue) {
    const post = normalizePost(postValue);
    const rawPost = postValue && typeof postValue === "object" ? postValue : {};
    const title = cleanText(post.text.split("\n")[0], 100) || `Post ${post.id}`;
    const translation = cleanText(rawPost.translationZh, LIMITS.postText);
    const digest = rawPost.digest && typeof rawPost.digest === "object" ? validateDigestPayload(rawPost.digest) : null;
    return [
      `## ${title}`,
      "",
      `- Author: ${[post.authorName, post.handle].filter(Boolean).join(" ") || "Unknown"}`,
      `- Published: ${post.publishedAt || "Not recorded"}`,
      `- Source: ${post.url}`,
      `- Record ID: \`${post.recordId}\``,
      "",
      "### Original",
      "",
      post.text,
      ...(translation ? ["", "### 中文", "", translation] : []),
      ...(digest ? ["", "### Digest", "", digest.summaryZh, ...(digest.toneZh ? ["", `- 语气：${digest.toneZh}`] : [])] : []),
    ].join("\n");
  }

  function libraryToMarkdown(posts, exportedAt = new Date().toISOString()) {
    const body = (Array.isArray(posts) ? posts : []).map(postToMarkdown).join("\n\n---\n\n");
    return ["# X Digest Saved Library", "", `Exported: ${exportedAt}`, "", body || "_No saved posts._", ""].join("\n");
  }

  function wordbookToMarkdown(entries, exportedAt = new Date().toISOString()) {
    const header = "| Expression | Type | 中文 | English explanation | Example | Source | Record ID |";
    const divider = "|---|---|---|---|---|---|---|";
    const rows = (Array.isArray(entries) ? entries : []).map((entry) => [
      entry.learningForm || entry.selectedText,
      entry.type,
      entry.meaningZh,
      entry.explanationEn,
      `${entry.exampleEn || ""}<br>${entry.exampleZh || ""}`,
      entry.sourceUrl ? `[X](${entry.sourceUrl})` : "",
      `<!-- xdg:${cleanText(entry.recordId, 100)} -->`,
    ].map(escapeMarkdownCell).join(" | ")).map((row) => `| ${row} |`);
    return ["# X Digest Wordbook", "", `Exported: ${exportedAt}`, "", header, divider, ...rows, ""].join("\n");
  }

  function completeSnapshotToMarkdown(posts, entries, exportedAt = new Date().toISOString()) {
    return [
      "# X Digest Complete Snapshot",
      "",
      `Exported: ${exportedAt}`,
      "",
      libraryToMarkdown(posts, exportedAt),
      "---",
      "",
      wordbookToMarkdown(entries, exportedAt),
    ].join("\n");
  }

  const api = {
    LIMITS,
    cleanText,
    normalizePost,
    validateTranslationPayload,
    validateDigestPayload,
    validateExplanationPayload,
    stableWordbookSource,
    sha256Hex,
    createWordbookEntry,
    upsertByRecordId,
    libraryToMarkdown,
    wordbookToMarkdown,
    completeSnapshotToMarkdown,
  };
  root.XDG_LEARNING_DATA = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
