(function initInteractionActions(root) {
  "use strict";

  const ACTIVE_POST_KEY = "xdg_active_post";

  async function openDigestFromUserGesture(chromeApi, postValue, tabId) {
    if (!Number.isInteger(tabId)) throw new Error("Open Digest requires an X tab and post.");
    const post = root.XDG_LEARNING_DATA.normalizePost(postValue);

    // sidePanel.open() must be invoked while Chrome still recognizes the
    // content-script click as an active user gesture. Do not put an await,
    // storage read, or other asynchronous boundary before this call.
    const openPanelPromise = chromeApi.sidePanel.open({ tabId });
    const savePostPromise = chromeApi.storage.local.set({ [ACTIVE_POST_KEY]: post });
    await Promise.all([openPanelPromise, savePostPromise]);
    return post;
  }

  const api = { ACTIVE_POST_KEY, openDigestFromUserGesture };
  root.XDG_INTERACTION_ACTIONS = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
