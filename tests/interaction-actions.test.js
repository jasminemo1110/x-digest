const test = require("node:test");
const assert = require("node:assert/strict");

global.XDG_LEARNING_DATA = require("../learning-data.js");
const interactions = require("../interaction-actions.js");

const POST = {
  id: "123",
  url: "https://x.com/example/status/123",
  text: "A useful post.",
};

test("opens the side panel before crossing the storage async boundary", async () => {
  const calls = [];
  let finishStorage;
  const storagePending = new Promise((resolve) => { finishStorage = resolve; });
  const chromeApi = {
    sidePanel: { open: (options) => { calls.push(["open", options]); return Promise.resolve(); } },
    storage: { local: { set: (value) => { calls.push(["store", value]); return storagePending; } } },
  };

  const pending = interactions.openDigestFromUserGesture(chromeApi, POST, 77);
  assert.equal(calls[0][0], "open");
  assert.deepEqual(calls[0][1], { tabId: 77 });
  assert.equal(calls[1][0], "store");
  finishStorage();
  await pending;
});

test("refreshes only the active matching post when Show More reveals additional text", async () => {
  let active = POST;
  const chromeApi = {
    storage: { local: {
      get: async () => ({ xdg_active_post: active }),
      set: async (value) => { active = value.xdg_active_post; },
    } },
  };

  const expanded = { ...POST, text: "A useful post. Now with the full article." };
  assert.equal((await interactions.refreshActivePost(chromeApi, expanded)).updated, true);
  assert.equal(active.text, expanded.text);
  assert.equal((await interactions.refreshActivePost(chromeApi, POST)).updated, false);
  assert.equal((await interactions.refreshActivePost(chromeApi, { ...expanded, id: "456", url: "https://x.com/example/status/456" })).updated, false);
});
