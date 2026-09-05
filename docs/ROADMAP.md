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

## Current stage

`v0.2.0` completes P1 and P1.5 as a usable local-first public beta. The next
planned product milestone is **P2 — Reply context**. It has not started yet:
the current `main` branch remains the stable P1.5 baseline for future work.

### Article reading on status pages

- Reads the rendered Article title and rich-text body on `/status/…` pages into the existing Reader, Summary, and learning flows.
- Requires a confirmed status link and a loaded body; a title or preview alone is not treated as article content.
- Preserves paragraph breaks and excludes engagement controls and replies from the source text.
- Reads up to 100,000 characters; longer sources retain an explicit partial-coverage notice. Above 10,000 characters, Reader recommends a sectioned summary and on-demand section translation.
- Verified selectors on Dan Koe's status `2077513202527773093`; the user confirmed the Article flow works after trying the updated extension.
- Summary action and result appear above the reading body so long articles do not require scrolling to the end.
- Long summaries cover every loaded character in consecutive paragraph-based sections, then synthesize an overview. Summary sections act as a compact navigation index without repeating the source. “回到全文位置” selects and reveals the matching source range.
- Original / 中文 / 双语 controls stay above an independently scrolling reading body. Switching to 中文 or 双语 translates the currently located section on demand; completed section translations remain cached and source-aligned.
- Summary results can be exported as Markdown with the overview, section summaries, complete loaded source, and any already-generated source-aligned section translations. Obsidian Clipper integration is intentionally deferred.
- Automated range/alignment checks and a local browser preview with simulated AI responses pass. Live provider quality and the refreshed extension flow need user verification.
- Focus-mode `/article/…` pages, semantic chapter detection, and image interpretation remain outside this increment.

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

Delivered:

1. **Local bilingual search for Library and Wordbook.** English matching ignores
   case; Chinese matching is literal; no AI call is made. Library covers source
   text, translation, author, summary, and key points. Wordbook covers the saved
   form, corrected form, meaning, explanation, usage, and examples.
2. **Side-panel lifecycle cleanup.** X Digest closes or disables itself after the
   active tab leaves X, preventing stale post content beside unrelated sites.
3. **Reader position continuity.** Each long post keeps an independent Reader
   position by status ID; invalid or absent state safely starts at the top.
4. **Lossless JSON backup and validated restore.** Backups preserve Library,
   Wordbook, compatible cache, and Reader positions, never export the API key,
   validate before writing, merge by stable ID, and download a safety copy before
   restore.
5. **Release polish.** Automated coverage covers the new failure states; the
   unpacked extension was verified on real X pages before the `v0.2.0` release.

Acceptance: a user can find previously saved English or Chinese material without
AI, leave and return to a long post without losing their place, and recover the
local learning collection from a validated backup without silent data loss.

### P2 — Reply context

Status: next milestone. Start only from the stable `v0.2.0` baseline, keeping
all P1.5 local search, backup, and recovery contracts intact.

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
- X Articles focus-mode extraction and semantic chapter detection.
- Image OCR or understanding, video transcription, or Spaces transcription.
- Scheduled digests, account monitoring, cloud sync, or direct Vault writes.

## V2 candidates

1. Import official X Bookmarks with incremental deduplication.
2. Optional bookmark synchronization after reassessing OAuth, API access, cost, and permissions.
3. User-triggered completion of partially loaded Threads.
4. Paginated reply collection with exact coverage and rate-limit reporting.
5. Extend X Articles support to focus mode and semantic chapter detection.
6. Image OCR, multimodal explanation, and video/audio transcription.
7. Daily or weekly digests for selected accounts or Lists.
8. Review states, spaced repetition, CSV, and Anki export.
9. Direct, stable-ID-aware Obsidian Vault updates.
10. An explicitly chosen local-first cross-device sync mechanism.
