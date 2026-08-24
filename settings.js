(function initSettings(root) {
  "use strict";

  const STORAGE_KEY = "xdg_settings";
  const DEFAULTS = Object.freeze({
    provider: "deepseek",
    apiKey: "",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
  });

  function cleanString(value, fallback = "", maxLength = 500) {
    if (typeof value !== "string") return fallback;
    const cleaned = value.trim();
    return cleaned ? cleaned.slice(0, maxLength) : fallback;
  }

  function normalize(value = {}) {
    const provider = cleanString(value.provider, DEFAULTS.provider, 40);
    return {
      provider: provider === "deepseek" ? provider : DEFAULTS.provider,
      apiKey: cleanString(value.apiKey, "", 500),
      baseUrl: cleanString(value.baseUrl, DEFAULTS.baseUrl, 500).replace(/\/+$/, ""),
      model: cleanString(value.model, DEFAULTS.model, 120),
    };
  }

  const api = { STORAGE_KEY, DEFAULTS, normalize };
  root.XDG_SETTINGS = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
