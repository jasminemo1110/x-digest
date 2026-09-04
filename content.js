"use strict";

const PROCESSED_ATTRIBUTE = "data-x-digest-ready";
const POST_CONTAINER_SELECTOR = '[data-testid="tweet"], [data-x-digest-detail-root="true"]';
const observedPostText = new WeakMap();
const SOURCE_FOCUS_KEY = "xdg_source_focus";
const SOURCE_FOCUS_RETRY_MS = 250;
let pendingSourceFocus = null;
let sourceFocusRequestId = "";
let sourceFocusRequestPending = false;
let sourceFocusRetryDeadline = 0;
let sourceFocusRetryTimer = 0;
let sourceFocusExpansionRequested = false;

function normalizedInlineText(value) {
  return String(value || "").replace(/\s+/gu, " ").trim();
}

function textRangeForExcerpt(root, focus) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const positions = [];
  let flattened = "";
  let node;
  while ((node = walker.nextNode())) {
    const value = node.nodeValue || "";
    for (let offset = 0; offset < value.length; offset += 1) {
      const character = value[offset];
      if (/\s/u.test(character)) {
        if (flattened && !flattened.endsWith(" ")) {
          flattened += " ";
          positions.push({ node, offset });
        }
      } else {
        flattened += character;
        positions.push({ node, offset });
      }
    }
  }

  const excerpt = normalizedInlineText(focus.excerpt);
  const sourceText = normalizedInlineText(focus.sourceText);
  let start = -1;
  if (sourceText) {
    const sourceStart = flattened.indexOf(sourceText);
    const excerptOffset = sourceText.indexOf(excerpt);
    if (sourceStart >= 0 && excerptOffset >= 0) start = sourceStart + excerptOffset;
  }
  if (start < 0) start = flattened.indexOf(excerpt);
  if (start < 0 || !positions[start] || !positions[start + excerpt.length - 1]) return null;

  const range = document.createRange();
  range.setStart(positions[start].node, positions[start].offset);
  const end = positions[start + excerpt.length - 1];
  range.setEnd(end.node, end.offset + 1);
  return range;
}

function scheduleSourceFocusRetry() {
  if (sourceFocusRetryTimer || Date.now() >= sourceFocusRetryDeadline) return;
  sourceFocusRetryTimer = setTimeout(() => {
    sourceFocusRetryTimer = 0;
    if (!pendingSourceFocus) sourceFocusRequestId = "";
    queueScan();
  }, SOURCE_FOCUS_RETRY_MS);
}

async function requestSourceFocus() {
  const statusId = currentDetailStatusId();
  const storage = globalThis.chrome?.storage?.local;
  if (!statusId || !storage || sourceFocusRequestPending || sourceFocusRequestId === statusId) return;
  if (!sourceFocusRetryDeadline) sourceFocusRetryDeadline = Date.now() + 10_000;
  sourceFocusRequestPending = true;
  sourceFocusRequestId = statusId;
  try {
    const stored = await storage.get(SOURCE_FOCUS_KEY);
    const focus = stored[SOURCE_FOCUS_KEY];
    if (focus?.expiresAt <= Date.now()) await storage.remove(SOURCE_FOCUS_KEY);
    const excerpt = typeof focus?.excerpt === "string" ? focus.excerpt.trim().slice(0, 4000) : "";
    pendingSourceFocus = focus?.statusId === statusId && excerpt
      ? { statusId, excerpt, sourceText: "" }
      : null;
    if (pendingSourceFocus) {
      sourceFocusExpansionRequested = false;
      sourceFocusRetryDeadline = Date.now() + 30_000;
    }
    if (!applySourceFocus()) scheduleSourceFocusRetry();
  } catch (_) {
    sourceFocusRequestId = "";
    scheduleSourceFocusRetry();
  } finally {
    sourceFocusRequestPending = false;
  }
}

function expandSourcePostIfNeeded(detailRoot) {
  if (sourceFocusExpansionRequested) return false;
  const showMore = [...detailRoot.querySelectorAll('button, [role="button"]')].find((node) => (
    node.closest(POST_CONTAINER_SELECTOR) === detailRoot
      && /^(show more|显示更多|查看更多|展开)$/iu.test(normalizedInlineText(node.textContent))
  ));
  if (!showMore) return false;
  sourceFocusExpansionRequested = true;
  showMore.click();
  return true;
}

function applySourceFocus() {
  if (!pendingSourceFocus) return false;
  const detailRoot = findDetailRoot();
  if (!detailRoot) return false;
  const range = textRangeForExcerpt(detailRoot, pendingSourceFocus);
  if (!range) {
    expandSourcePostIfNeeded(detailRoot);
    return false;
  }
  const anchor = range.startContainer.parentElement || detailRoot;
  anchor.scrollIntoView({ behavior: "smooth", block: "center" });
  document.documentElement.classList.add("x-digest-source-focusing");
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range.cloneRange());
  if (globalThis.CSS?.highlights && typeof globalThis.Highlight === "function") {
    CSS.highlights.set("x-digest-source-focus", new Highlight(range));
  }
  pendingSourceFocus = null;
  sourceFocusRetryDeadline = 0;
  if (sourceFocusRetryTimer) clearTimeout(sourceFocusRetryTimer);
  sourceFocusRetryTimer = 0;
  globalThis.chrome?.storage?.local?.remove(SOURCE_FOCUS_KEY).catch(() => {});
  return true;
}

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
  return {
    id: match[1],
    url: new URL(path, location.origin).href,
    publishedAt: time?.getAttribute("datetime") || "",
  };
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
  const previousText = observedPostText.get(article) || "";
  observedPostText.set(article, post.text);
  if (previousText && post.text.length > previousText.length) {
    globalThis.chrome?.runtime?.sendMessage({ action: "refreshActivePost", post }).catch(() => {});
  }
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
    const currentPost = extractPost(article) || post;
    runtime.sendMessage({ action: "openDigest", post: currentPost }).catch(() => {
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
  if (!applySourceFocus()) {
    if (pendingSourceFocus) scheduleSourceFocusRetry();
    else void requestSourceFocus();
  }
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
