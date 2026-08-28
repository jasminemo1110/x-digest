"use strict";

importScripts("settings.js", "ai-provider.js", "learning-data.js", "reader-state.js", "backup-data.js", "ai-actions.js", "interaction-actions.js", "panel-lifecycle.js");

const SAVED_POSTS_KEY = "xdg_saved_posts";
const WORDBOOK_KEY = "xdg_wordbook";
const AI_CACHE_KEY = "xdg_ai_cache";
const READER_POSITIONS_KEY = "xdg_reader_positions";

async function readBackupData() {
  const stored = await chrome.storage.local.get([
    SAVED_POSTS_KEY,
    WORDBOOK_KEY,
    AI_CACHE_KEY,
    READER_POSITIONS_KEY,
  ]);
  return {
    library: Array.isArray(stored[SAVED_POSTS_KEY]) ? stored[SAVED_POSTS_KEY] : [],
    wordbook: Array.isArray(stored[WORDBOOK_KEY]) ? stored[WORDBOOK_KEY] : [],
    aiCache: stored[AI_CACHE_KEY] && typeof stored[AI_CACHE_KEY] === "object" ? stored[AI_CACHE_KEY] : {},
    readerPositions: stored[READER_POSITIONS_KEY] && typeof stored[READER_POSITIONS_KEY] === "object"
      ? stored[READER_POSITIONS_KEY]
      : {},
  };
}

async function restoreBackup(backupValue) {
  const backup = XDG_BACKUP_DATA.validateBackup(backupValue);
  const current = await readBackupData();
  const merged = XDG_BACKUP_DATA.mergeBackupData(current, backup.data);
  await chrome.storage.local.set({
    [SAVED_POSTS_KEY]: merged.library,
    [WORDBOOK_KEY]: merged.wordbook,
    [AI_CACHE_KEY]: merged.aiCache,
    [READER_POSITIONS_KEY]: merged.readerPositions,
  });
  return {
    libraryCount: merged.library.length,
    wordbookCount: merged.wordbook.length,
    cacheCount: Object.keys(merged.aiCache).length,
  };
}

async function getSettings() {
  const stored = await chrome.storage.local.get(XDG_SETTINGS.STORAGE_KEY);
  return XDG_SETTINGS.normalize(stored[XDG_SETTINGS.STORAGE_KEY]);
}

function providerError(response, body) {
  if (response.status === 401 || response.status === 403) return new Error("DeepSeek rejected the API key. Open Settings and check it.");
  if (response.status === 429) return new Error("DeepSeek rate limit reached. Wait briefly and try again.");
  const detail = XDG_LEARNING_DATA.cleanText(body?.error?.message, 300);
  return new Error(detail ? `DeepSeek error (${response.status}): ${detail}` : `DeepSeek request failed (${response.status}).`);
}

async function requestAiContent(settings, messages, options) {
  const startedAt = performance.now();
  const request = XDG_AI_PROVIDER.buildRequest(settings, messages, {
    ...options,
    json: true,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  let response;
  try {
    response = await fetch(request.url, { ...request.init, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("DeepSeek request timed out. Try again.");
    throw new Error("Could not reach DeepSeek. Check your connection and try again.");
  } finally {
    clearTimeout(timeout);
  }

  const headersAt = performance.now();
  const rawText = await response.text();
  const bodyAt = performance.now();
  if (rawText.length > 2 * 1024 * 1024) throw new Error("DeepSeek response was too large.");
  let body = {};
  try { body = JSON.parse(rawText); } catch (_) {}
  if (!response.ok) throw providerError(response, body);
  return {
    content: body?.choices?.[0]?.message?.content,
    headersMs: Math.round(headersAt - startedAt),
    bodyMs: Math.round(bodyAt - headersAt),
  };
}

async function callAi(action, postValue, selectedText = "") {
  const startedAt = performance.now();
  const settings = await getSettings();
  const actionRequest = XDG_AI_ACTIONS.buildActionRequest(action, postValue, selectedText);
  const attempts = [];
  const first = await requestAiContent(settings, actionRequest.messages, {
    temperature: 0.1,
    maxTokens: actionRequest.maxTokens,
  });
  attempts.push(first);
  const result = await XDG_AI_ACTIONS.validateJsonResponseWithRepair(
    first.content,
    actionRequest.validate,
    async (candidate) => {
      const repaired = await requestAiContent(
        settings,
        actionRequest.buildRepairMessages
          ? actionRequest.buildRepairMessages(candidate)
          : XDG_AI_ACTIONS.buildJsonRepairMessages(actionRequest.repairContract, candidate),
        { temperature: 0, maxTokens: actionRequest.maxTokens },
      );
      attempts.push(repaired);
      return repaired.content;
    },
  );
  console.debug("[X Digest performance]", {
    action,
    headersMs: first.headersMs,
    bodyMs: first.bodyMs,
    totalMs: Math.round(performance.now() - startedAt),
    attempts: attempts.length,
    repaired: result.repaired,
  });
  return result.value;
}

async function cachePostResult(postValue, field, value) {
  const post = XDG_LEARNING_DATA.normalizePost(postValue);
  const stored = await chrome.storage.local.get(AI_CACHE_KEY);
  const cache = stored[AI_CACHE_KEY] && typeof stored[AI_CACHE_KEY] === "object" ? stored[AI_CACHE_KEY] : {};
  cache[post.id] = { ...(cache[post.id] || {}), [field]: value, updatedAt: new Date().toISOString() };
  const recent = Object.entries(cache)
    .sort((left, right) => String(right[1]?.updatedAt || "").localeCompare(String(left[1]?.updatedAt || "")))
    .slice(0, 200);
  await chrome.storage.local.set({ [AI_CACHE_KEY]: Object.fromEntries(recent) });
  return value;
}

async function runCachedAction(action, postValue) {
  const post = XDG_LEARNING_DATA.normalizePost(postValue);
  const field = action === "translate" ? "translation" : "digest";
  const stored = await chrome.storage.local.get(AI_CACHE_KEY);
  const cached = stored[AI_CACHE_KEY]?.[post.id]?.[field];
  const cacheIsCurrent = action !== "translate" || XDG_LEARNING_DATA.isAlignedTranslation(cached, post.text);
  if (cached && cacheIsCurrent) return { value: cached, cached: true };
  const value = await callAi(action, post);
  await cachePostResult(post, field, value);
  return { value, cached: false };
}

async function savePost(postValue, extras = {}) {
  const post = XDG_LEARNING_DATA.normalizePost(postValue);
  const stored = await chrome.storage.local.get(SAVED_POSTS_KEY);
  const posts = Array.isArray(stored[SAVED_POSTS_KEY]) ? stored[SAVED_POSTS_KEY] : [];
  const cacheStored = await chrome.storage.local.get(AI_CACHE_KEY);
  const cached = cacheStored[AI_CACHE_KEY]?.[post.id] || {};
  const next = {
    ...post,
    ...(cached.translation ? { translationZh: cached.translation.translationZh } : {}),
    ...(cached.digest ? { digest: cached.digest } : {}),
    ...extras,
    savedAt: new Date().toISOString(),
  };
  const existing = posts.find((item) => item?.recordId === next.recordId);
  if (existing?.text?.length > next.text.length) next.text = existing.text;
  const result = XDG_LEARNING_DATA.upsertByRecordId(posts, next);
  await chrome.storage.local.set({ [SAVED_POSTS_KEY]: result.entries });
  return result;
}

async function saveWordbook(postValue, explanationValue) {
  const entry = await XDG_LEARNING_DATA.createWordbookEntry(postValue, explanationValue);
  const stored = await chrome.storage.local.get(WORDBOOK_KEY);
  const result = XDG_LEARNING_DATA.upsertByRecordId(stored[WORDBOOK_KEY], entry);
  await chrome.storage.local.set({ [WORDBOOK_KEY]: result.entries });
  return result;
}

async function saveExcerpt(postValue, selectedText) {
  const entry = await XDG_LEARNING_DATA.createSavedExcerpt(postValue, selectedText);
  const stored = await chrome.storage.local.get(SAVED_POSTS_KEY);
  const posts = Array.isArray(stored[SAVED_POSTS_KEY]) ? stored[SAVED_POSTS_KEY] : [];
  const existing = posts.find((item) => item?.recordId === entry.recordId);
  let translationZh = XDG_LEARNING_DATA.cleanText(existing?.translationZh, XDG_LEARNING_DATA.LIMITS.postText);
  let translationError = "";
  if (!translationZh) {
    try {
      translationZh = (await callAi("translateExcerpt", postValue, selectedText)).translationZh;
    } catch (error) {
      translationError = XDG_LEARNING_DATA.cleanText(error?.message, 500) || "Translation was unavailable.";
    }
  }
  const nextEntry = translationZh ? { ...entry, translationZh } : entry;
  const result = XDG_LEARNING_DATA.upsertByRecordId(posts, nextEntry);
  await chrome.storage.local.set({ [SAVED_POSTS_KEY]: result.entries });
  return { ...result, translationError };
}

async function savePostWithTranslation(postValue) {
  let translation = null;
  let translationError = "";
  try {
    translation = (await runCachedAction("translate", postValue)).value;
  } catch (error) {
    translationError = XDG_LEARNING_DATA.cleanText(error?.message, 500) || "Translation was unavailable.";
  }
  const result = await savePost(postValue);
  return { ...result, translation, translationError };
}

async function handleAction(message) {
  switch (message?.action) {
    case "getConfigStatus": {
      const settings = await getSettings();
      return { success: true, hasApiKey: !!settings.apiKey, provider: settings.provider, model: settings.model };
    }
    case "translatePost":
      return { success: true, ...(await runCachedAction("translate", message.post)) };
    case "digestPost":
      return { success: true, ...(await runCachedAction("digest", message.post)) };
    case "explainSelection":
      return { success: true, value: await callAi("explain", message.post, message.selectedText) };
    case "savePost":
      return { success: true, ...(await savePostWithTranslation(message.post)) };
    case "saveExcerpt":
      return { success: true, ...(await saveExcerpt(message.post, message.selectedText)) };
    case "saveWordbook":
      return { success: true, ...(await saveWordbook(message.post, message.explanation)) };
    case "getCollections": {
      const [stored, storageBytesInUse] = await Promise.all([
        chrome.storage.local.get([SAVED_POSTS_KEY, WORDBOOK_KEY, AI_CACHE_KEY]),
        chrome.storage.local.getBytesInUse(null),
      ]);
      return {
        success: true,
        posts: Array.isArray(stored[SAVED_POSTS_KEY]) ? stored[SAVED_POSTS_KEY] : [],
        entries: Array.isArray(stored[WORDBOOK_KEY]) ? stored[WORDBOOK_KEY] : [],
        cache: stored[AI_CACHE_KEY] && typeof stored[AI_CACHE_KEY] === "object" ? stored[AI_CACHE_KEY] : {},
        storageBytesInUse,
        storageQuotaBytes: chrome.storage.local.QUOTA_BYTES || 10 * 1024 * 1024,
      };
    }
    case "exportJsonBackup": {
      const backup = XDG_BACKUP_DATA.createBackup(await readBackupData());
      return {
        success: true,
        backup,
        skippedCacheCount: backup.metadata.skippedIncompatibleCacheEntries,
      };
    }
    case "restoreJsonBackup":
      return { success: true, ...(await restoreBackup(message.backup)) };
    case "deleteSavedPost": {
      const stored = await chrome.storage.local.get(SAVED_POSTS_KEY);
      const posts = (Array.isArray(stored[SAVED_POSTS_KEY]) ? stored[SAVED_POSTS_KEY] : []).filter((post) => (
        message.recordId ? post.recordId !== message.recordId : post.id !== String(message.id)
      ));
      await chrome.storage.local.set({ [SAVED_POSTS_KEY]: posts });
      return { success: true };
    }
    case "deleteWordbookEntry": {
      const stored = await chrome.storage.local.get(WORDBOOK_KEY);
      const entries = (Array.isArray(stored[WORDBOOK_KEY]) ? stored[WORDBOOK_KEY] : []).filter((entry) => entry.recordId !== message.recordId);
      await chrome.storage.local.set({ [WORDBOOK_KEY]: entries });
      return { success: true };
    }
    default:
      return null;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = XDG_PANEL_LIFECYCLE.getNavigationUrl(changeInfo, tab);
  if (!url) return;
  void XDG_PANEL_LIFECYCLE.updatePanelForTab(chrome, tabId, url, tab.windowId);
});

chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    void XDG_PANEL_LIFECYCLE.updatePanelForTab(
      chrome,
      tabId,
      tab.url || tab.pendingUrl,
      windowId,
    );
  } catch (_) {}
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.action === "openDigest") {
      await XDG_INTERACTION_ACTIONS.openDigestFromUserGesture(
        chrome,
        message.post,
        sender.tab?.id,
      );
      return { success: true };
    }
    return handleAction(message);
  })()
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ success: false, error: XDG_LEARNING_DATA.cleanText(error?.message, 500) || "Unexpected X Digest error." }));

  return true;
});
