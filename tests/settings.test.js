"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const settings = require("../settings.js");

test("X Digest defaults to one DeepSeek provider without transcript settings", () => {
  const normalized = settings.normalize({});
  assert.equal(normalized.provider, "deepseek");
  assert.equal(normalized.baseUrl, "https://api.deepseek.com");
  assert.equal(normalized.model, "deepseek-v4-flash");
  assert.equal(Object.hasOwn(normalized, "supadataApiKey"), false);
});

test("settings trim the key and remove trailing endpoint slashes", () => {
  const normalized = settings.normalize({ apiKey: "  secret  ", baseUrl: "https://api.deepseek.com///" });
  assert.equal(normalized.apiKey, "secret");
  assert.equal(normalized.baseUrl, "https://api.deepseek.com");
});
