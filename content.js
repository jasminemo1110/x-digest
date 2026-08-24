"use strict";

const PROCESSED_ATTRIBUTE = "data-x-digest-ready";
const POST_CONTAINER_SELECTOR = '[data-testid="tweet"], [data-x-digest-detail-root="true"]';

function firstOwned(container, selector) {
  return [...container.querySelectorAll(selector)].find((node) => node.closest(POST_CONTAINER_SELECTOR) === container) || null;
}

function statusIdentity(article) {
  const ownedTimes = [...article.querySelectorAll("time")].filter((time) => time.closest(POST_CONTAINER_SELECTOR) === article);
  const detailId = article.getAttribute("data-x-digest-detail-root") === "true"
    ? currentDetailStatusId()
    : "";
  const time = detailId
    ? ownedTimes.find((candidate) => statusIdFromLink(candidate.closest('a[href*="/status/"]')) === detailId)
    : ownedTimes[0];
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

function currentDetailStatusId() {
  return location.pathname.match(/\/status\/(\d+)/)?.[1] || "";
}

function statusIdFromLink(link) {
  return link?.getAttribute("href")?.match(/\/status\/(\d+)/)?.[1] || "";
}

function findDetailRoot() {
  const detailId = currentDetailStatusId();
  if (!detailId) return null;
  const matchingTime = [...document.querySelectorAll('a[href*="/status/"] time')].find((time) =>
    statusIdFromLink(time.closest("a")) === detailId,
  );
  const root = matchingTime?.closest('[data-testid="tweet"], article');
  if (!root) return null;
  root.setAttribute("data-x-digest-detail-root", "true");
  return root;
}

function detailRootSlot(article) {
  let slot = firstOwned(article, ".x-digest-detail-slot");
  if (slot) return slot;
  const text = firstOwned(article, '[data-testid="tweetText"]');
  if (!text?.parentElement) return null;
  slot = document.createElement("div");
  slot.className = "x-digest-detail-slot";
  slot.setAttribute("aria-label", "X Digest action for this post");
  text.insertAdjacentElement("beforebegin", slot);
  return slot;
}

function attachDigestButton(article) {
  const post = extractPost(article);
  if (!post) return;
  const isDetailRoot = post.id === currentDetailStatusId();

  // X can replace an action bar while retaining the surrounding article.
  // The old ready marker then survives even though our button is gone, so the
  // button itself—not only the marker—is the source of truth.
  const existingButton = firstOwned(article, ".x-digest-inline-button");
  if (existingButton) {
    const isInDetailSlot = !!existingButton.closest(".x-digest-detail-slot");
    if (isDetailRoot === isInDetailSlot) return;
    existingButton.closest(".x-digest-detail-slot")?.remove();
    existingButton.remove();
  }

  const target = isDetailRoot
    ? detailRootSlot(article)
    : [...article.querySelectorAll('[role="group"]')].find((group) =>
      group.closest('article[data-testid="tweet"]') === article
        && group.querySelector('[data-testid="reply"], [data-testid="like"], [data-testid="unlike"]'),
    );
  if (!target) return;
  article.setAttribute(PROCESSED_ATTRIBUTE, "true");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "x-digest-inline-button";
  button.textContent = "Digest";
  button.setAttribute("aria-label", "Open in X Digest");
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const runtime = globalThis.chrome?.runtime;
    if (!runtime?.sendMessage) {
      button.textContent = "Refresh X";
      button.setAttribute("aria-label", "Refresh this X tab after reloading X Digest");
      button.title = "Refresh this X tab after reloading X Digest.";
      return;
    }
    runtime.sendMessage({ action: "openDigest", post }).catch(() => {
      button.textContent = "Retry";
      button.title = "X Digest could not connect. Refresh this X tab if the extension was reloaded.";
    });
  });
  target.append(button);
}

function scan() {
  const containers = new Set(document.querySelectorAll('[data-testid="tweet"]'));
  const detailRoot = findDetailRoot();
  if (detailRoot) containers.add(detailRoot);
  containers.forEach(attachDigestButton);
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
