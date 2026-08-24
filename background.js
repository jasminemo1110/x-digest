"use strict";

importScripts("settings.js", "ai-provider.js", "learning-data.js", "ai-actions.js");

const ACTIVE_POST_KEY = "xdg_active_post";
const SAVED_POSTS_KEY = "xdg_saved_posts";
const WORDBOOK_KEY = "xdg_wordbook";
const AI_CACHE_KEY = "xdg_ai_cache";

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

async function callAi(action, postValue, selectedText = "") {
  const settings = await getSettings();
  const actionRequest = XDG_AI_ACTIONS.buildActionRequest(action, postValue, selectedText);
  const request = XDG_AI_PROVIDER.buildRequest(settings, actionRequest.messages, { json: true, temperature: 0.1 });
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

  const rawText = await response.text();
  if (rawText.length > 2 * 1024 * 1024) throw new Error("DeepSeek response was too large.");
  let body = {};
  try { body = JSON.parse(rawText); } catch (_) {}
  if (!response.ok) throw providerError(response, body);
  const content = body?.choices?.[0]?.message?.content;
  return actionRequest.validate(XDG_AI_ACTIONS.parseJsonObject(content));
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
  if (cached) return { value: cached, cached: true };
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
      return { success: true, ...(await savePost(message.post)) };
    case "saveWordbook":
      return { success: true, ...(await saveWordbook(message.post, message.explanation)) };
    case "getCollections": {
      const stored = await chrome.storage.local.get([SAVED_POSTS_KEY, WORDBOOK_KEY, AI_CACHE_KEY]);
      return {
        success: true,
        posts: Array.isArray(stored[SAVED_POSTS_KEY]) ? stored[SAVED_POSTS_KEY] : [],
        entries: Array.isArray(stored[WORDBOOK_KEY]) ? stored[WORDBOOK_KEY] : [],
        cache: stored[AI_CACHE_KEY] && typeof stored[AI_CACHE_KEY] === "object" ? stored[AI_CACHE_KEY] : {},
      };
    }
    case "deleteSavedPost": {
      const stored = await chrome.storage.local.get(SAVED_POSTS_KEY);
      const posts = (Array.isArray(stored[SAVED_POSTS_KEY]) ? stored[SAVED_POSTS_KEY] : []).filter((post) => post.id !== String(message.id));
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.action === "openDigest") {
      if (!message.post || !sender.tab?.id) throw new Error("Open Digest requires an X tab and post.");
      const post = XDG_LEARNING_DATA.normalizePost(message.post);
      await chrome.storage.local.set({ [ACTIVE_POST_KEY]: post });
      await chrome.sidePanel.open({ tabId: sender.tab.id });
      return { success: true };
    }
    return handleAction(message);
  })()
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ success: false, error: XDG_LEARNING_DATA.cleanText(error?.message, 500) || "Unexpected X Digest error." }));

  return true;
});
