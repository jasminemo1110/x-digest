(function initPanelLifecycle(root) {
  "use strict";

  function isXUrl(value) {
    try {
      const url = new URL(value || "");
      return ["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname);
    } catch (_) {
      return false;
    }
  }

  function getNavigationUrl(changeInfo = {}, tab = {}) {
    if (changeInfo.url) return changeInfo.url;
    if (changeInfo.status !== "loading" && changeInfo.status !== "complete") return "";
    return tab.pendingUrl || tab.url || "";
  }

  async function closePanelForTab(chromeApi, tabId, windowId) {
    if (typeof chromeApi?.sidePanel?.close !== "function") return;
    try {
      await chromeApi.sidePanel.close({ tabId });
      return;
    } catch (_) {}
    if (Number.isInteger(windowId)) {
      await chromeApi.sidePanel.close({ windowId }).catch(() => {});
    }
  }

  async function updatePanelForTab(chromeApi, tabId, url, windowId) {
    if (!Number.isInteger(tabId)) return;
    if (!isXUrl(url)) {
      await closePanelForTab(chromeApi, tabId, windowId);
      await chromeApi.sidePanel.setOptions({ tabId, enabled: false }).catch(() => {});
      return;
    }
    await chromeApi.sidePanel.setOptions({
      tabId,
      path: "sidepanel.html",
      enabled: true,
    }).catch(() => {});
  }

  const api = { isXUrl, getNavigationUrl, closePanelForTab, updatePanelForTab };
  root.XDG_PANEL_LIFECYCLE = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
