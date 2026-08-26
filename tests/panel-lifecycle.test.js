const test = require("node:test");
const assert = require("node:assert/strict");

const lifecycle = require("../panel-lifecycle.js");

test("recognizes only X and Twitter web pages", () => {
  assert.equal(lifecycle.isXUrl("https://x.com/example/status/123"), true);
  assert.equal(lifecycle.isXUrl("https://twitter.com/example/status/123"), true);
  assert.equal(lifecycle.isXUrl("https://example.com/?next=https://x.com"), false);
  assert.equal(lifecycle.isXUrl("chrome://extensions"), false);
});

test("uses committed and loading navigation URLs but ignores cosmetic updates", () => {
  assert.equal(lifecycle.getNavigationUrl({ url: "https://x.com/home" }, {}), "https://x.com/home");
  assert.equal(lifecycle.getNavigationUrl({ status: "loading" }, { pendingUrl: "https://example.com" }), "https://example.com");
  assert.equal(lifecycle.getNavigationUrl({ status: "complete" }, { url: "https://x.com/home" }), "https://x.com/home");
  assert.equal(lifecycle.getNavigationUrl({ title: "New title" }, { url: "https://x.com/home" }), "");
});

test("enables the panel on X and closes then disables it elsewhere", async () => {
  const calls = [];
  const chromeApi = {
    sidePanel: {
      close: async (options) => calls.push(["close", options]),
      setOptions: async (options) => calls.push(["setOptions", options]),
    },
  };

  await lifecycle.updatePanelForTab(chromeApi, 17, "https://x.com/home", 4);
  assert.deepEqual(calls.shift(), ["setOptions", { tabId: 17, path: "sidepanel.html", enabled: true }]);

  await lifecycle.updatePanelForTab(chromeApi, 17, "https://example.com", 4);
  assert.deepEqual(calls, [
    ["close", { tabId: 17 }],
    ["setOptions", { tabId: 17, enabled: false }],
  ]);
});

test("falls back to window close when Chrome rejects tab-specific close", async () => {
  const calls = [];
  const chromeApi = {
    sidePanel: {
      close: async (options) => {
        calls.push(options);
        if (Object.hasOwn(options, "tabId")) throw new Error("global panel");
      },
    },
  };
  await lifecycle.closePanelForTab(chromeApi, 17, 4);
  assert.deepEqual(calls, [{ tabId: 17 }, { windowId: 4 }]);
});
