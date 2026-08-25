# X Digest translation architecture

This document records the translation invariants and incremental architecture
direction for X Digest. It adapts reusable lessons documented from YouTube
Digest upstream `v1.2.0` (`5462cae`) to X's post, reply, and Thread model. It is
not a claim that every upstream mechanism is already implemented here.

## Current P1 baseline

X Digest already provides the following foundation:

- post text is normalized and segmented before it reaches the AI provider;
- every translation segment has an extension-owned stable ID;
- the model returns translations for those IDs rather than rebuilding post
  structure;
- returned IDs, counts, uniqueness, alignment, and text lengths are validated;
- original, Chinese, and bilingual renderers preserve the original evidence;
- verified translations are cached locally and reused by Library saves;
- provider-specific requests stay behind `ai-provider.js`;
- malformed structured output receives at most one format-only repair attempt.

For a single bounded X post, one aligned request remains simpler and sufficient.
Progressive batching should be introduced only when reply collections, Threads,
Articles, or another genuinely long surface requires it.

## Non-negotiable invariants

1. The extension owns post IDs, record IDs, segment IDs, order, and context
   relationships. AI only returns translated text for supplied IDs.
2. Original text remains recoverable and exportable. Translation never replaces
   the only copy of source evidence.
3. Only the smallest content required for the current user action, plus necessary
   context, is sent to the provider.
4. Every AI response is untrusted input: validate shape and identity, limit text,
   and render with safe text APIs.
5. Translation failure degrades locally. One missing segment or failed batch must
   not make the original post, Library, or Wordbook unavailable.
6. Cache identity must not depend on the provider or API key, and credentials must
   never enter segment data or cache keys.
7. A late response from an older post, display mode, target language, or request
   generation must never overwrite the current view.

## X segment contract

The reusable internal model should evolve toward:

```js
{
  id: "post:2091688655828246890:block:b1",
  text: "Source text owned by the extension",
  surface: "post | reply | thread | quote | article | alt-text",
  sourceLanguage: "en",
  targetLanguage: "zh-CN",
  contextGroupId: "conversation-or-thread-id",
  policy: "translate | preserve | annotate"
}
```

The X adapter—not the AI—decides the segment IDs, ordering, neighboring context,
and policy. Handles, URLs, hashtags, code, and significant numbers should be
preserved by default. A future image-description or language-learning annotation
surface may use `annotate` without pretending it is ordinary translation.

## Cache identity and invalidation

The current P1 cache is keyed primarily by post ID. Before target-language
selection or multi-surface translation is introduced, migrate toward this
identity:

```text
schema version
+ document or conversation identity
+ source language
+ target language
+ surface
+ stable segment ID
+ source-text hash
+ prompt/policy version
```

This prevents reuse after a post edit, translation-policy change, or target
language switch. Cache capacity and eviction remain explicit because cached
translations share Chrome local storage with Library and Wordbook records.

## Scheduling and stale-response protection

Single posts can continue to use one bounded request. Longer surfaces should use
a shared scheduler with these rules:

- translate small batches sequentially rather than flooding the provider;
- render and cache each validated batch as soon as it returns;
- prioritize the visible or explicitly requested surface;
- cancel queued work after navigation or mode changes;
- attach a request-generation token and discard late responses;
- retry only the failed batch and leave completed segments intact.

Viewport-triggered work is appropriate for long Threads, loaded replies, or
Articles. It is unnecessary overhead for a normal single post.

## Product-stage integration

### P2 reply context

- represent `root → direct parent → current reply` as an extension-owned context
  group;
- translate the current reply while supplying only the minimum necessary parent
  context;
- preserve missing-context status rather than asking AI to infer unseen posts;
- store source identity and minimal context with saved replies and Wordbook
  records.

### P3 loaded replies and Threads

- give every observed post its own stable identity and ordered segment set;
- deduplicate and batch without asking AI to reconstruct Thread order;
- show the exact number of loaded items and translated segments;
- protect the current view from late results while X recycles or replaces DOM
  nodes.

### Future language and surface expansion

- separate `displayMode` (`original | translation | bilingual`) from
  `targetLanguage`;
- add source-text hashes and prompt/policy versions before supporting another
  target language;
- treat X Articles, alt text, OCR, and media transcription as separate adapters
  with explicit privacy and size boundaries.

## Reuse boundary

Do not copy a complete `sidepanel.js` from another extension or introduce a
shared service prematurely. First reuse the contracts, invariants, cache identity,
and acceptance tests inside X Digest. Extract a shared package only when a second
actively maintained product needs the same tested module and the ownership,
versioning, and release process are clear.

## Acceptance checklist

- Original, translation, and bilingual modes preserve the same segment identity.
- Missing, duplicate, unknown, or oversized segment responses are rejected or
  locally degraded; reordered valid IDs are reconciled to extension-owned order.
- A source-text change invalidates the old translation.
- A target-language or policy change cannot reuse an incompatible cache entry.
- Rapid navigation or display changes cannot render a late result into the new
  post.
- Long surfaces translate progressively without a burst of concurrent requests.
- Handles, URLs, hashtags, code, and protected learning text are not accidentally
  rewritten.
- Refreshing the extension restores validated cached results without losing the
  original source.
- Automated tests are supplemented by real X checks for navigation, scrolling,
  mode switching, copy, and original-text recovery.
