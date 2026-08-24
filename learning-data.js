(function initLearningData(root) {
  "use strict";

  const LIMITS = Object.freeze({
    postText: 20000,
    selectedText: 500,
    excerptText: 4000,
    shortText: 1000,
    explanation: 4000,
    entries: 1000,
  });

  const ENTRY_TYPES = new Set(["word", "phrase", "expression", "sentence"]);
  const ASSESSMENTS = new Set(["as_is", "corrected", "uncertain"]);
  const X_EPOCH_MS = 1288834974657n;

  function cleanText(value, maxLength = LIMITS.shortText) {
    if (typeof value !== "string") return "";
    return value.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
  }

  function requiredText(value, field, maxLength) {
    const cleaned = cleanText(value, maxLength);
    if (!cleaned) throw new Error(`AI response is missing ${field}.`);
    return cleaned;
  }

  function publishedAtFromStatusId(value) {
    try {
      const milliseconds = Number((BigInt(value) >> 22n) + X_EPOCH_MS);
      if (!Number.isFinite(milliseconds)) return "";
      const date = new Date(milliseconds);
      return Number.isNaN(date.getTime()) ? "" : date.toISOString();
    } catch (_) {
      return "";
    }
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
      publishedAt: publishedAtFromStatusId(id) || cleanText(value.publishedAt, 100),
      capturedAt: cleanText(value.capturedAt, 100),
    };
  }

  function segmentPostText(value) {
    const text = cleanText(value, LIMITS.postText);
    if (!text) return [];
    const paragraphs = text.split(/\n+/).map((part) => part.trim()).filter(Boolean);
    const blocks = [];
    const segmenter = typeof Intl?.Segmenter === "function"
      ? new Intl.Segmenter("en", { granularity: "sentence" })
      : null;

    for (const paragraph of paragraphs) {
      if (paragraph.length <= 420) {
        blocks.push(paragraph);
        continue;
      }
      const sentences = segmenter
        ? [...segmenter.segment(paragraph)].map((item) => item.segment.trim()).filter(Boolean)
        : paragraph.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((item) => item.trim()).filter(Boolean) || [paragraph];
      let current = "";
      for (const sentence of sentences) {
        if (current && current.length + sentence.length + 1 > 420) {
          blocks.push(current);
          current = sentence;
        } else {
          current = [current, sentence].filter(Boolean).join(" ");
        }
      }
      if (current) blocks.push(current);
    }
    return blocks.map((original, index) => ({ id: `b${index + 1}`, original }));
  }

  function validateTranslationPayload(value = {}, sourceSegments = []) {
    if (!Array.isArray(sourceSegments) || sourceSegments.length === 0) {
      return { translationZh: requiredText(value.translationZh, "translationZh", LIMITS.postText) };
    }
    if (!Array.isArray(value.segments) || value.segments.length !== sourceSegments.length) {
      throw new Error("AI response has incomplete aligned translation segments.");
    }
    const translatedById = new Map();
    for (const item of value.segments) {
      const id = cleanText(item?.id, 30);
      if (!id || translatedById.has(id)) throw new Error("AI response has invalid translation segment IDs.");
      translatedById.set(id, requiredText(item?.translationZh, "translationZh", LIMITS.explanation));
    }
    const segments = sourceSegments.map((source) => {
      if (!translatedById.has(source.id)) throw new Error(`AI response is missing translation segment ${source.id}.`);
      return { id: source.id, original: source.original, translationZh: translatedById.get(source.id) };
    });
    if ([...translatedById.keys()].some((id) => !sourceSegments.some((source) => source.id === id))) {
      throw new Error("AI response contains unknown translation segment IDs.");
    }
    return {
      translationZh: segments.map((segment) => segment.translationZh).join("\n\n"),
      segments,
    };
  }

  function isAlignedTranslation(value, postText) {
    const sourceSegments = segmentPostText(postText);
    if (!value || !Array.isArray(value.segments) || value.segments.length !== sourceSegments.length) return false;
    return sourceSegments.every((source, index) => {
      const candidate = value.segments[index];
      return candidate?.id === source.id && candidate?.original === source.original && !!cleanText(candidate?.translationZh, LIMITS.explanation);
    });
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

  function normalizeEntryType(value, text) {
    const normalized = cleanText(value, 30).toLowerCase();
    return ENTRY_TYPES.has(normalized) ? normalized : inferEntryType(text);
  }

  function normalizeLearningForm(value, type) {
    const cleaned = cleanText(value, LIMITS.selectedText);
    if (!["word", "phrase", "expression"].includes(type)) return cleaned;
    const withoutSelectionPunctuation = cleaned
      .replace(/^[\s"“”‘’([{]+/u, "")
      .replace(/[\s"“”‘’)\]}.,!?;:。！？；：，]+$/u, "");
    return withoutSelectionPunctuation || cleaned;
  }

  function normalizeStoredExplanation(value = {}, fallbackSelection = "") {
    const rawSelectedText = cleanText(
      value.rawSelectedText || value.selectedText || fallbackSelection,
      LIMITS.selectedText,
    );
    const rawAssessment = cleanText(value.assessment, 30).toLowerCase();
    const assessment = ASSESSMENTS.has(rawAssessment) ? rawAssessment : "unassessed";
    const suppliedLearningForm = cleanText(value.learningForm || rawSelectedText, LIMITS.selectedText);
    const unnormalizedLearningForm = assessment === "unassessed"
      ? rawSelectedText || suppliedLearningForm
      : suppliedLearningForm;
    const type = normalizeEntryType(value.type || value.entryType, unnormalizedLearningForm || rawSelectedText);
    const learningForm = normalizeLearningForm(unnormalizedLearningForm, type);
    const defaultAssessment = {
      as_is: ["Correct and natural in this context.", "在当前语境中正确自然。"],
      corrected: ["A correction is recommended.", "建议修正后学习。"],
      uncertain: ["The intended form is uncertain from this context.", "仅凭当前语境无法确定原意。"],
      unassessed: ["Not assessed by the current learning model.", "这条旧记录尚未经过自然度判断。"],
    }[assessment];
    return {
      rawSelectedText,
      selectedText: rawSelectedText,
      learningForm,
      type,
      assessment,
      assessmentEn: cleanText(value.assessmentEn, LIMITS.explanation) || defaultAssessment[0],
      assessmentZh: cleanText(value.assessmentZh, LIMITS.explanation) || defaultAssessment[1],
      pronunciation: cleanText(value.pronunciation, 200),
      meaningZh: cleanText(value.meaningZh || value.chineseExplanation, LIMITS.explanation),
      explanationEn: cleanText(value.explanationEn || value.englishExplanation, LIMITS.explanation),
      usageZh: cleanText(value.usageZh || value.usageNote || value.usageNoteZh, LIMITS.explanation),
      exampleEn: cleanText(value.exampleEn || value.cleanSourceSentence, LIMITS.explanation),
      exampleZh: cleanText(value.exampleZh || value.sourceSentenceZh, LIMITS.explanation),
    };
  }

  function validateExplanationPayload(value = {}, fallbackSelection = "") {
    const rawSelectedText = requiredText(
      fallbackSelection || value.rawSelectedText || value.selectedText,
      "rawSelectedText",
      LIMITS.selectedText,
    );
    const assessment = cleanText(value.assessment, 30).toLowerCase();
    if (!ASSESSMENTS.has(assessment)) throw new Error("AI response has an unsupported assessment.");
    const suppliedLearningForm = requiredText(value.learningForm, "learningForm", LIMITS.selectedText);
    const unnormalizedLearningForm = assessment === "corrected" ? suppliedLearningForm : rawSelectedText;
    const type = normalizeEntryType(value.type || value.entryType, unnormalizedLearningForm);
    const learningForm = normalizeLearningForm(unnormalizedLearningForm, type);
    const pronunciation = cleanText(value.pronunciation, 200);
    if (type === "word" && !/^\/[^/\n]{1,100}\/$/.test(pronunciation)) {
      throw new Error("AI response is missing a valid IPA pronunciation.");
    }
    return {
      rawSelectedText,
      selectedText: rawSelectedText,
      learningForm,
      type,
      assessment,
      assessmentEn: requiredText(value.assessmentEn, "assessmentEn", LIMITS.explanation),
      assessmentZh: requiredText(value.assessmentZh, "assessmentZh", LIMITS.explanation),
      pronunciation,
      meaningZh: requiredText(value.meaningZh, "meaningZh", LIMITS.explanation),
      explanationEn: requiredText(value.explanationEn, "explanationEn", LIMITS.explanation),
      usageZh: cleanText(value.usageZh, LIMITS.explanation),
      exampleEn: requiredText(value.exampleEn, "exampleEn", LIMITS.explanation),
      exampleZh: requiredText(value.exampleZh, "exampleZh", LIMITS.explanation),
    };
  }

  function stableWordbookSource(postId, explanation) {
    return [
      "xdg-wordbook-v1",
      cleanText(postId, 40),
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

  function postContainsExcerpt(postText, excerptText) {
    const normalizeSpace = (text) => cleanText(text, LIMITS.postText).replace(/\s+/g, " ");
    return normalizeSpace(postText).includes(normalizeSpace(excerptText));
  }

  async function createSavedExcerpt(postValue, excerptValue, now = new Date().toISOString()) {
    const post = normalizePost(postValue);
    const text = requiredText(excerptValue, "excerptText", LIMITS.excerptText);
    if (!postContainsExcerpt(post.text, text)) throw new Error("The excerpt must come from the current post.");
    const identity = ["xdg-excerpt-v1", post.id, text.normalize("NFKC").toLocaleLowerCase("en-US")].join("\n");
    const recordId = `x-excerpt:${(await sha256Hex(identity)).slice(0, 32)}`;
    return {
      ...post,
      recordId,
      kind: "excerpt",
      sourcePostId: post.id,
      sourceText: post.text,
      text,
      savedAt: now,
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

  function markdownTitle(value, maxLength = 100) {
    const cleaned = cleanText(value, LIMITS.postText).split("\n")[0];
    if (cleaned.length <= maxLength) return cleaned;
    const clipped = cleaned.slice(0, maxLength - 1);
    const lastSpace = clipped.lastIndexOf(" ");
    const boundary = lastSpace >= Math.floor(maxLength * 0.6) ? lastSpace : clipped.length;
    return `${clipped.slice(0, boundary).trimEnd()}…`;
  }

  function storageWarning(value = {}) {
    const usedBytes = Number(value.usedBytes) || 0;
    const quotaBytes = Number(value.quotaBytes) || 0;
    const libraryCount = Math.max(0, Number(value.libraryCount) || 0);
    const wordbookCount = Math.max(0, Number(value.wordbookCount) || 0);
    if (quotaBytes > 0 && usedBytes / quotaBytes >= 0.9) {
      const percentage = Math.min(100, Math.round((usedBytes / quotaBytes) * 100));
      return `X Digest storage is ${percentage}% full. Export a complete snapshot soon to protect your learning records.`;
    }
    const nearLimits = [];
    if (libraryCount >= 950) nearLimits.push(`Library has ${libraryCount} of ${LIMITS.entries} entries`);
    if (wordbookCount >= 950) nearLimits.push(`Wordbook has ${wordbookCount} of ${LIMITS.entries} entries`);
    return nearLimits.length
      ? `${nearLimits.join("; ")}. Export a complete snapshot before older records are replaced.`
      : "";
  }

  function postToMarkdown(postValue) {
    const post = normalizePost(postValue);
    const rawPost = postValue && typeof postValue === "object" ? postValue : {};
    const title = markdownTitle(post.text) || `Post ${post.id}`;
    const translation = cleanText(rawPost.translationZh, LIMITS.postText);
    const digest = rawPost.digest && typeof rawPost.digest === "object" ? validateDigestPayload(rawPost.digest) : null;
    const isExcerpt = rawPost.kind === "excerpt";
    const recordId = cleanText(rawPost.recordId, 100) || post.recordId;
    return [
      `## ${isExcerpt ? "Excerpt: " : ""}${title}`,
      "",
      `- Type: ${isExcerpt ? "Excerpt" : "Post"}`,
      `- Author: ${[post.authorName, post.handle].filter(Boolean).join(" ") || "Unknown"}`,
      `- Published: ${post.publishedAt || "Not recorded"}`,
      `- Source: ${post.url}`,
      `- Record ID: \`${recordId}\``,
      "",
      "### Original",
      "",
      post.text,
      ...(translation ? ["", "### 中文", "", translation] : []),
      ...(digest ? [
        "", "### Digest", "", digest.summaryZh,
        ...(digest.toneZh ? ["", `- 语气：${digest.toneZh}`] : []),
        ...(digest.keyPointsZh.length ? ["", "#### Key Points · 要点", "", ...digest.keyPointsZh.map((point) => `- ${point}`)] : []),
      ] : []),
    ].join("\n");
  }

  function libraryToMarkdown(posts, exportedAt = new Date().toISOString()) {
    const body = (Array.isArray(posts) ? posts : []).map(postToMarkdown).join("\n\n---\n\n");
    return ["# X Digest Saved Library", "", `Exported: ${exportedAt}`, "", body || "_No saved posts._", ""].join("\n");
  }

  function wordbookToMarkdown(entries, exportedAt = new Date().toISOString()) {
    const header = "| Expression | IPA | Type | Naturalness | 中文 | English explanation | Usage | Example | Source | Record ID |";
    const divider = "|---|---|---|---|---|---|---|---|---|---|";
    const rows = (Array.isArray(entries) ? entries : []).map((entry) => {
      const explanation = normalizeStoredExplanation(entry);
      const cells = [
        explanation.learningForm || explanation.rawSelectedText,
        explanation.pronunciation,
        explanation.type,
        `${explanation.assessmentEn}<br>${explanation.assessmentZh}`,
        explanation.meaningZh,
        explanation.explanationEn,
        explanation.usageZh,
        `${explanation.exampleEn || ""}<br>${explanation.exampleZh || ""}`,
        entry.sourceUrl ? `[X](${entry.sourceUrl})` : "",
        `<!-- xdg:${cleanText(entry.recordId, 100)} -->`,
      ];
      return `| ${cells.map(escapeMarkdownCell).join(" | ")} |`;
    });
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
    publishedAtFromStatusId,
    normalizePost,
    segmentPostText,
    validateTranslationPayload,
    isAlignedTranslation,
    validateDigestPayload,
    normalizeStoredExplanation,
    validateExplanationPayload,
    stableWordbookSource,
    sha256Hex,
    createWordbookEntry,
    createSavedExcerpt,
    upsertByRecordId,
    libraryToMarkdown,
    wordbookToMarkdown,
    completeSnapshotToMarkdown,
    markdownTitle,
    storageWarning,
  };
  root.XDG_LEARNING_DATA = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
