"use strict";

let activePost = null;

function render(post) {
  activePost = post || null;
  document.getElementById("emptyState").hidden = !!activePost;
  document.getElementById("postCard").hidden = !activePost;
  if (!activePost) return;
  document.getElementById("author").textContent = [post.authorName, post.handle].filter(Boolean).join(" ");
  document.getElementById("postText").textContent = post.text;
  document.getElementById("sourceLink").href = post.url;
}

async function loadActivePost() {
  const result = await chrome.storage.local.get("xdg_active_post");
  render(result.xdg_active_post);
}

document.getElementById("saveButton").addEventListener("click", async () => {
  if (!activePost?.id) return;
  const result = await chrome.storage.local.get("xdg_saved_posts");
  const posts = Array.isArray(result.xdg_saved_posts) ? result.xdg_saved_posts : [];
  const savedAt = new Date().toISOString();
  const existingIndex = posts.findIndex((post) => post.id === activePost.id);
  const savedPost = { ...activePost, savedAt };
  if (existingIndex >= 0) posts[existingIndex] = { ...posts[existingIndex], ...savedPost };
  else posts.unshift(savedPost);
  await chrome.storage.local.set({ xdg_saved_posts: posts.slice(0, 1000) });
  document.getElementById("status").textContent = existingIndex >= 0 ? "Saved record updated." : "Saved locally.";
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.xdg_active_post) render(changes.xdg_active_post.newValue);
});

loadActivePost();
