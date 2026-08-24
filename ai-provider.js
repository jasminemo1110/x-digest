(function initAiProvider(root) {
  "use strict";

  function buildDeepSeekRequest(settings, messages, options = {}) {
    if (!settings.apiKey) throw new Error("DeepSeek API key is not configured.");
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error("AI messages are required.");
    }

    return {
      url: `${settings.baseUrl}/chat/completions`,
      init: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: settings.model,
          messages,
          stream: false,
          temperature: options.temperature ?? 0.2,
          thinking: { type: "disabled" },
          ...(Number.isInteger(options.maxTokens) ? { max_tokens: options.maxTokens } : {}),
          ...(options.json ? { response_format: { type: "json_object" } } : {}),
        }),
      },
    };
  }

  function buildRequest(settings, messages, options) {
    if (settings.provider === "deepseek") {
      return buildDeepSeekRequest(settings, messages, options);
    }
    throw new Error(`Unsupported AI provider: ${settings.provider}`);
  }

  const api = { buildRequest };
  root.XDG_AI_PROVIDER = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
