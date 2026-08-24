"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const provider = require("../ai-provider.js");

test("DeepSeek-specific request details stay in the provider layer", () => {
  const request = provider.buildRequest(
    { provider: "deepseek", apiKey: "test-key", baseUrl: "https://api.deepseek.com", model: "model-x" },
    [{ role: "user", content: "Explain this." }],
    { json: true, maxTokens: 1200 },
  );
  const body = JSON.parse(request.init.body);
  assert.equal(request.url, "https://api.deepseek.com/chat/completions");
  assert.equal(request.init.headers.Authorization, "Bearer test-key");
  assert.equal(body.model, "model-x");
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.equal(body.max_tokens, 1200);
  assert.deepEqual(body.thinking, { type: "disabled" });
});

test("provider refuses missing credentials and unsupported vendors", () => {
  assert.throws(() => provider.buildRequest({ provider: "deepseek", apiKey: "" }, [{ role: "user", content: "x" }]), /not configured/);
  assert.throws(() => provider.buildRequest({ provider: "unknown", apiKey: "x" }, [{ role: "user", content: "x" }]), /Unsupported/);
});
