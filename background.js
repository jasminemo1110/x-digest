"use strict";

importScripts("settings.js", "ai-provider.js");

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action !== "openDigest" || !message.post || !sender.tab?.id) return false;

  (async () => {
    await chrome.storage.local.set({ xdg_active_post: message.post });
    await chrome.sidePanel.open({ tabId: sender.tab.id });
    sendResponse({ success: true });
  })().catch((error) => sendResponse({ success: false, error: error.message }));

  return true;
});
