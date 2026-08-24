"use strict";

async function loadSettings() {
  const result = await chrome.storage.local.get(XDG_SETTINGS.STORAGE_KEY);
  const settings = XDG_SETTINGS.normalize(result[XDG_SETTINGS.STORAGE_KEY]);
  document.getElementById("apiKey").value = settings.apiKey;
  document.getElementById("modelName").textContent = settings.model;
}

document.getElementById("settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const settings = XDG_SETTINGS.normalize({ apiKey: document.getElementById("apiKey").value });
  await chrome.storage.local.set({ [XDG_SETTINGS.STORAGE_KEY]: settings });
  document.getElementById("status").textContent = "Saved locally.";
});

loadSettings();

document.getElementById("clearKeyButton").addEventListener("click", async () => {
  const settings = XDG_SETTINGS.normalize({ apiKey: "" });
  await chrome.storage.local.set({ [XDG_SETTINGS.STORAGE_KEY]: settings });
  document.getElementById("apiKey").value = "";
  document.getElementById("status").textContent = "API key removed. Local saves and exports were kept.";
});
