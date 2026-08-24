"use strict";

const PROCESSED_ATTRIBUTE = "data-x-digest-ready";

function firstOwned(article, selector) {
  return [...article.querySelectorAll(selector)].find((node) => node.closest('article[data-testid="tweet"]') === article) || null;
}

function statusIdentity(article) {
  const time = firstOwned(article, "time");
  const link = time?.closest('a[href*="/status/"]');
  const match = link?.getAttribute("href")?.match(/^\/(?:i\/web\/status\/|[^/]+\/status\/)(\d+)/);
  if (!match) return null;
  const path = link.getAttribute("href");
  return { id: match[1], url: new URL(path, location.origin).href };
}

function extractPost(article) {
  const identity = statusIdentity(article);
  const text = firstOwned(article, '[data-testid="tweetText"]')?.innerText?.trim();
  if (!identity || !text) return null;

  const userName = firstOwned(article, '[data-testid="User-Name"]');
  const handle = [...(userName?.querySelectorAll("span") || [])]
    .map((node) => node.textContent?.trim())
    .find((value) => value?.startsWith("@")) || "";

  return {
    ...identity,
    text: text.slice(0, 20000),
    authorName: userName?.querySelector("span")?.textContent?.trim()?.slice(0, 200) || "",
    handle: handle.slice(0, 100),
    publishedAt: firstOwned(article, "time")?.getAttribute("datetime") || "",
    capturedAt: new Date().toISOString(),
  };
}

function attachDigestButton(article) {
  if (article.hasAttribute(PROCESSED_ATTRIBUTE)) return;

  const post = extractPost(article);
  const actionGroup = [...article.querySelectorAll('[role="group"]')].find((group) =>
    group.closest('article[data-testid="tweet"]') === article
      && group.querySelector('[data-testid="reply"], [data-testid="like"], [data-testid="unlike"]'),
  );
  if (!post || !actionGroup) return;
  article.setAttribute(PROCESSED_ATTRIBUTE, "true");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "x-digest-inline-button";
  button.textContent = "Digest";
  button.setAttribute("aria-label", "Open in X Digest");
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    chrome.runtime.sendMessage({ action: "openDigest", post });
  });
  actionGroup.append(button);
}

function scan() {
  document.querySelectorAll('article[data-testid="tweet"]').forEach(attachDigestButton);
}

let scanQueued = false;
function queueScan() {
  if (scanQueued) return;
  scanQueued = true;
  requestAnimationFrame(() => {
    scanQueued = false;
    scan();
  });
}

new MutationObserver(queueScan).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
scan();
