# X Digest product scope and roadmap

## Product promise

While the user browses X normally, X Digest turns currently loaded posts, threads, and replies into contextual material that can be translated, explained, saved, accumulated in a wordbook, and exported as Markdown.

## API boundary

V1 needs only one AI provider credential. X page text comes from the currently rendered page, so there is no transcript provider equivalent to Supadata.

The first supported provider is DeepSeek. Provider-specific endpoint, model, request fields, retry behavior, and errors stay inside `ai-provider.js`. A key from another provider is not interchangeable with a DeepSeek key; supporting another provider requires a matching adapter and Chrome host permission, while the page, library, and wordbook layers remain unchanged.

## Translation architecture direction

P1 already uses extension-owned segment IDs, strict response alignment, safe three-mode rendering, and local verified-result caching. Future reply, Thread, target-language, and long-surface work must build on those contracts instead of letting AI reconstruct product data or copying another extension's side panel wholesale.

The detailed current baseline, invariants, cache evolution, batching boundary, and acceptance checklist live in [the X Digest translation architecture](TRANSLATION_ARCHITECTURE.md). It adapts lessons from YouTube Digest upstream `v1.2.0` while clearly separating verified X Digest behavior from future plans.

## V1 delivery stages

### P0 — Independent foundation

- Independent repository and Manifest V3 identity.
- Minimal permissions for X, local storage, side panel, and DeepSeek.
- Inline Digest action on currently rendered post cards.
- Stable extraction of status ID, URL, author, and visible text.
- Side panel handoff and local save without AI.
- Isolated AI provider settings and request construction.

Acceptance: the unpacked extension can open a real X post in its side panel and save it once by status ID; no Supadata or X credential is involved.

### P1 — Core single-post learning loop

Status: completed for the public-beta scope with automated coverage and manual unpacked-extension verification on real X posts, detail pages, long posts, and visible replies.

- Original, Chinese, and bilingual display.
- On-demand post translation and short Digest summary.
- Text selection and contextual Explain.
- Save whole post to the local library.
- Wordbook entries for words, phrases, expressions, and sentences.
- Stable IDs and duplicate upgrades.
- Library, Wordbook, and complete Markdown snapshot exports.
- Settings and clear provider error states.

Acceptance: `see post → Digest → translate/explain → save → export Markdown` works without reloading the page.

### P1.5 — Local search, continuity, and recovery

Status: completed for `v0.2.0` with automated coverage and manual unpacked-extension verification of local bilingual search, panel closing outside X, per-post Reader position restoration, JSON export, and merge restoration.

Implement in this order:

1. **Local bilingual search for Library and Wordbook.** Search only data already
   stored in Chrome: English matching is case-insensitive, Chinese matching is
   literal, and no AI call is made. Library search covers source text, Chinese
   translation, author, summary, and key points. Wordbook search covers the saved
   form, corrected form, meaning, explanation, usage, and examples. Show the
   result count, highlight matches safely, and support clear and keyboard actions.
   Search within a loaded Thread belongs to P3 rather than this first search
   surface.
2. **Side-panel lifecycle cleanup.** Close or disable X Digest when the active tab
   leaves `x.com`, and reconcile the panel again on X client-side or tab
   navigation so stale post content is not left beside unrelated sites.
3. **Reader position continuity.** Preserve and restore the side-panel reading
   position for a long post by status ID. A different post starts from its own
   position, and removed or invalid state degrades to the top of the Reader.
4. **Lossless JSON backup and validated restore.** Keep Markdown as the
   human-readable export, while adding a schema-versioned backup that can restore
   Library, Wordbook, and compatible cached learning data. Validate identity,
   shape, and limits before writing; never silently replace local data, and create
   a safety copy before any replacement path.
5. **P1.5 release polish.** Cover search, navigation, position restoration, and
   backup failure states with automated tests; verify the unpacked extension on
   real X pages; then prepare a documented GitHub release.

Acceptance: a user can find previously saved English or Chinese material without
AI, leave and return to a long post without losing their place, and recover the
local learning collection from a validated backup without silent data loss.

### P2 — Reply context

Implement after P1.5, in this order:

1. **Context extraction without AI.** Identify the conversation root, direct
   parent, and current reply from content already rendered or captured during the
   current page session. Deduplicate the root when it is also the direct parent.
2. **Stable context contract.** Represent
   `root → direct parent → current reply` as an extension-owned context group with
   stable post and segment IDs. Mark each layer as available, partial, or missing;
   do not ask AI to reconstruct unseen posts.
3. **Context-aware learning actions.** Supply only the minimum available context
   to translation, Explain, and Summarize while keeping the current reply as the
   primary content. Preserve handles, URLs, hashtags, code, and significant
   numbers according to adapter policy.
4. **Context-aware saves and exports.** Store the minimal supporting context with
   saved replies and Wordbook records, and include it in Markdown and JSON without
   duplicating the current reply.
5. **Disclosure and real-page verification.** Show a clear partial-context notice
   in the side panel and test root replies, nested replies, missing parents,
   quoted posts, and X client-side navigation on real pages.

Acceptance: a nested reply receives a context-aware explanation, and missing parents are disclosed rather than guessed.

### P3 — Loaded conversation and Thread summaries

- Capture replies observed during the current conversation-page session.
- Deduplicate by status ID and exclude root, promotions, and invalid cards.
- Search English or Chinese text across the currently loaded conversation and
  move between matching posts without an AI call.
- Translate or analyze long loaded surfaces in small sequential batches with request-generation protection against late responses.
- “Summarize loaded replies” with an explicit analyzed count.
- Summarize consensus, disagreement, representative views, questions, tone, and useful English expressions.
- Detect same-author loaded Thread items and show the analyzed item count.

Acceptance: results always say how many captured items were analyzed and never claim full-comment coverage.

### P4 — V1 hardening and release

- Handle X client-side navigation, infinite scrolling, DOM recycling, expanded replies, and long-post truncation.
- Validate AI JSON, length-limit fields, and escape rendered content.
- Add source-text hashes and versioned cache identities before target-language or translation-policy expansion.
- Discard late translation results after post, mode, language, or request-generation changes.
- Preserve local saves when AI calls fail or no key is configured.
- Bilingual settings, privacy/security documentation, packaging checks, and real-page regression checklist.
- Explicit unsupported states for X Articles, media-only posts, deleted/private content, and incomplete threads.

Acceptance: automated checks pass and the extension is manually verified on an X home timeline, post detail, Thread, direct reply, and nested reply.

## V1 non-goals

- Importing or syncing official X Bookmarks.
- Whole-timeline, Likes, profile-history, or account-wide collection.
- Automatically opening every reply branch.
- Claiming a complete reply count.
- X Articles body extraction.
- Image OCR or understanding, video transcription, or Spaces transcription.
- Scheduled digests, account monitoring, cloud sync, or direct Vault writes.

## V2 candidates

1. Import official X Bookmarks with incremental deduplication.
2. Optional bookmark synchronization after reassessing OAuth, API access, cost, and permissions.
3. User-triggered completion of partially loaded Threads.
4. Paginated reply collection with exact coverage and rate-limit reporting.
5. X Articles extraction and structured bilingual reading.
6. Image OCR, multimodal explanation, and video/audio transcription.
7. Daily or weekly digests for selected accounts or Lists.
8. Review states, spaced repetition, CSV, and Anki export.
9. Direct, stable-ID-aware Obsidian Vault updates.
10. An explicitly chosen local-first cross-device sync mechanism.
