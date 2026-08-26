(function initBackupData(root) {
  "use strict";

  const APPLICATION = "x-digest";
  const SCHEMA_VERSION = 1;

  function cleanTimestamp(value) {
    const text = XDG_LEARNING_DATA.cleanText(value, 100);
    return Number.isNaN(Date.parse(text)) ? "" : text;
  }

  function validateLibraryPost(value = {}) {
    const post = XDG_LEARNING_DATA.normalizePost(value);
    const kind = value.kind === "excerpt" ? "excerpt" : "post";
    const expectedPostId = `x-post:${post.id}`;
    const recordId = XDG_LEARNING_DATA.cleanText(value.recordId, 120) || expectedPostId;
    if (kind === "excerpt") {
      if (!/^x-excerpt:[a-f0-9]{32}$/.test(recordId)) throw new Error("Backup contains an invalid Library excerpt ID.");
    } else if (recordId !== expectedPostId) {
      throw new Error("Backup contains an invalid Library post ID.");
    }
    const translationZh = XDG_LEARNING_DATA.cleanText(value.translationZh, XDG_LEARNING_DATA.LIMITS.postText);
    const digest = value.digest && typeof value.digest === "object"
      ? XDG_LEARNING_DATA.validateDigestPayload(value.digest)
      : null;
    return {
      ...post,
      recordId,
      kind,
      ...(kind === "excerpt" ? {
        sourcePostId: XDG_LEARNING_DATA.cleanText(value.sourcePostId || post.id, 40),
        sourceText: XDG_LEARNING_DATA.cleanText(value.sourceText, XDG_LEARNING_DATA.LIMITS.postText),
      } : {}),
      ...(translationZh ? { translationZh } : {}),
      ...(digest ? { digest } : {}),
      savedAt: cleanTimestamp(value.savedAt),
    };
  }

  function validateWordbookEntry(value = {}) {
    const recordId = XDG_LEARNING_DATA.cleanText(value.recordId, 100);
    if (!/^[a-f0-9]{64}$/.test(recordId)) throw new Error("Backup contains an invalid Wordbook record ID.");
    const source = XDG_LEARNING_DATA.normalizePost({
      id: value.sourcePostId,
      text: value.sourceText,
      url: value.sourceUrl,
      authorName: value.authorName,
      handle: value.handle,
    });
    const explanation = XDG_LEARNING_DATA.normalizeStoredExplanation(value);
    if (!explanation.learningForm || (!explanation.meaningZh && !explanation.explanationEn)) {
      throw new Error("Backup contains an incomplete Wordbook record.");
    }
    return {
      recordId,
      ...explanation,
      sourcePostId: source.id,
      sourceText: source.text,
      sourceUrl: source.url,
      authorName: source.authorName,
      handle: source.handle,
      createdAt: cleanTimestamp(value.createdAt),
      updatedAt: cleanTimestamp(value.updatedAt),
    };
  }

  function validateCachedTranslation(value = {}) {
    const translationZh = XDG_LEARNING_DATA.cleanText(value.translationZh, XDG_LEARNING_DATA.LIMITS.postText);
    const sourceSegments = Array.isArray(value.segments) ? value.segments.map((segment) => ({
      id: XDG_LEARNING_DATA.cleanText(segment?.id, 30),
      original: XDG_LEARNING_DATA.cleanText(segment?.original, XDG_LEARNING_DATA.LIMITS.explanation),
    })) : [];
    if (!translationZh || !sourceSegments.length || sourceSegments.some((segment) => !segment.id || !segment.original)) {
      throw new Error("Backup contains an incomplete translation cache entry.");
    }
    return XDG_LEARNING_DATA.validateTranslationPayload(value, sourceSegments);
  }

  function validateCache(value = {}) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const entries = Object.entries(value).map(([postId, raw]) => {
      if (!/^\d+$/.test(postId) || !raw || typeof raw !== "object") {
        throw new Error("Backup contains an invalid AI cache identity.");
      }
      const translation = raw.translation ? validateCachedTranslation(raw.translation) : null;
      const digest = raw.digest ? XDG_LEARNING_DATA.validateDigestPayload(raw.digest) : null;
      if (!translation && !digest) throw new Error("Backup contains an empty AI cache entry.");
      return [postId, {
        ...(translation ? { translation } : {}),
        ...(digest ? { digest } : {}),
        updatedAt: cleanTimestamp(raw.updatedAt),
      }];
    });
    return Object.fromEntries(entries
      .sort((left, right) => String(right[1].updatedAt).localeCompare(String(left[1].updatedAt)))
      .slice(0, 200));
  }

  function sanitizeCacheForExport(value = {}) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { cache: {}, skipped: 0 };
    }
    const cache = {};
    let skipped = 0;
    for (const [postId, raw] of Object.entries(value)) {
      try {
        Object.assign(cache, validateCache({ [postId]: raw }));
      } catch (_) {
        skipped += 1;
      }
    }
    return { cache: validateCache(cache), skipped };
  }

  function validateData(value = {}) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Backup data is missing.");
    const posts = Array.isArray(value.library) ? value.library : [];
    const entries = Array.isArray(value.wordbook) ? value.wordbook : [];
    if (posts.length > XDG_LEARNING_DATA.LIMITS.entries || entries.length > XDG_LEARNING_DATA.LIMITS.entries) {
      throw new Error("Backup exceeds X Digest collection limits.");
    }
    const library = posts.map(validateLibraryPost);
    const wordbook = entries.map(validateWordbookEntry);
    if (new Set(library.map((item) => item.recordId)).size !== library.length) {
      throw new Error("Backup contains duplicate Library record IDs.");
    }
    if (new Set(wordbook.map((item) => item.recordId)).size !== wordbook.length) {
      throw new Error("Backup contains duplicate Wordbook record IDs.");
    }
    return {
      library,
      wordbook,
      aiCache: validateCache(value.aiCache),
      readerPositions: XDG_READER_STATE.normalizePositions(value.readerPositions),
    };
  }

  function validateBackup(value = {}) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Choose a valid X Digest JSON backup.");
    if (value.application !== APPLICATION || value.schemaVersion !== SCHEMA_VERSION) {
      throw new Error("This backup version is not supported by X Digest.");
    }
    return {
      application: APPLICATION,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: cleanTimestamp(value.exportedAt) || new Date().toISOString(),
      metadata: {
        skippedIncompatibleCacheEntries: Math.max(
          0,
          Math.min(200, Math.floor(Number(value.metadata?.skippedIncompatibleCacheEntries) || 0)),
        ),
      },
      data: validateData(value.data),
    };
  }

  function createBackup(data, exportedAt = new Date().toISOString()) {
    const sanitizedCache = sanitizeCacheForExport(data?.aiCache);
    return validateBackup({
      application: APPLICATION,
      schemaVersion: SCHEMA_VERSION,
      exportedAt,
      metadata: { skippedIncompatibleCacheEntries: sanitizedCache.skipped },
      data: {
        library: data?.library,
        wordbook: data?.wordbook,
        aiCache: sanitizedCache.cache,
        readerPositions: data?.readerPositions,
      },
    });
  }

  function parseBackup(text) {
    if (typeof text !== "string" || text.length > 12 * 1024 * 1024) {
      throw new Error("Choose an X Digest JSON backup smaller than 12 MB.");
    }
    let value;
    try { value = JSON.parse(text); }
    catch (_) { throw new Error("The selected file is not valid JSON."); }
    return validateBackup(value);
  }

  function stringifyBackup(value) {
    return `${JSON.stringify(validateBackup(value), null, 2)}\n`;
  }

  function mergeRecords(current, incoming) {
    let entries = Array.isArray(current) ? [...current] : [];
    for (let index = incoming.length - 1; index >= 0; index -= 1) {
      entries = XDG_LEARNING_DATA.upsertByRecordId(entries, incoming[index]).entries;
    }
    return entries;
  }

  function timestampValue(value) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
    return Date.parse(value || "") || 0;
  }

  function mergeTimedObjects(currentValue, incomingValue, limit, normalize) {
    const current = normalize(currentValue);
    const incoming = normalize(incomingValue);
    const merged = { ...current };
    for (const [id, value] of Object.entries(incoming)) {
      const currentTime = timestampValue(merged[id]?.updatedAt);
      const incomingTime = timestampValue(value?.updatedAt);
      if (!merged[id] || incomingTime >= currentTime) merged[id] = value;
    }
    return Object.fromEntries(Object.entries(merged)
      .sort((left, right) => {
        const leftTime = timestampValue(left[1]?.updatedAt);
        const rightTime = timestampValue(right[1]?.updatedAt);
        return rightTime - leftTime;
      })
      .slice(0, limit));
  }

  function mergeBackupData(currentValue, incomingValue) {
    const incoming = validateData(incomingValue);
    const current = currentValue && typeof currentValue === "object" ? currentValue : {};
    return {
      library: mergeRecords(current.library, incoming.library),
      wordbook: mergeRecords(current.wordbook, incoming.wordbook),
      aiCache: mergeTimedObjects(current.aiCache, incoming.aiCache, 200, validateCache),
      readerPositions: mergeTimedObjects(
        current.readerPositions,
        incoming.readerPositions,
        XDG_READER_STATE.MAX_POSITIONS,
        XDG_READER_STATE.normalizePositions,
      ),
    };
  }

  const api = {
    APPLICATION,
    SCHEMA_VERSION,
    createBackup,
    validateBackup,
    parseBackup,
    stringifyBackup,
    mergeBackupData,
  };
  root.XDG_BACKUP_DATA = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
