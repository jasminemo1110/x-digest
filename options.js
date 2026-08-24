"use strict";

async function loadSettings() {
  const result = await chrome.storage.local.get(XDG_SETTINGS.STORAGE_KEY);
  const settings = XDG_SETTINGS.normalize(result[XDG_SETTINGS.STORAGE_KEY]);
  document.getElementById("apiKey").value = settings.apiKey;
}

document.getElementById("settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const settings = XDG_SETTINGS.normalize({ apiKey: document.getElementById("apiKey").value });
  await chrome.storage.local.set({ [XDG_SETTINGS.STORAGE_KEY]: settings });
  document.getElementById("status").textContent = "Saved locally.";
});

loadSettings();
