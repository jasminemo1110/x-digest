# X Digest product scope and roadmap

## Product promise

While the user browses X normally, X Digest turns currently loaded posts, threads, and replies into contextual material that can be translated, explained, saved, accumulated in a wordbook, and exported as Markdown.

## API boundary

V1 needs only one AI provider credential. X page text comes from the currently rendered page, so there is no transcript provider equivalent to Supadata.

The first supported provider is DeepSeek. Provider-specific endpoint, model, request fields, retry behavior, and errors stay inside `ai-provider.js`. A key from another provider is not interchangeable with a DeepSeek key; supporting another provider requires a matching adapter and Chrome host permission, while the page, library, and wordbook layers remain unchanged.

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

Status: implemented in code with automated coverage; unpacked-extension verification on real X pages is still pending.

- Original, Chinese, and bilingual display.
- On-demand post translation and short Digest summary.
- Text selection and contextual Explain.
- Save whole post to the local library.
- Wordbook entries for words, phrases, expressions, and sentences.
- Stable IDs and duplicate upgrades.
- Library, Wordbook, and complete Markdown snapshot exports.
- Settings and clear provider error states.

Acceptance: `see post → Digest → translate/explain → save → export Markdown` works without reloading the page.

### P2 — Reply context

- Identify the conversation root, direct parent, and current reply.
- Deduplicate root when it is also the direct parent.
- Feed only `root → direct parent → current reply` to AI.
- Clearly mark partial or unavailable context; never invent missing content.
- Store the minimal supporting context with saved replies and wordbook records.

Acceptance: a nested reply receives a context-aware explanation, and missing parents are disclosed rather than guessed.

### P3 — Loaded conversation and Thread summaries

- Capture replies observed during the current conversation-page session.
- Deduplicate by status ID and exclude root, promotions, and invalid cards.
- “Summarize loaded replies” with an explicit analyzed count.
- Summarize consensus, disagreement, representative views, questions, tone, and useful English expressions.
- Detect same-author loaded Thread items and show the analyzed item count.

Acceptance: results always say how many captured items were analyzed and never claim full-comment coverage.

### P4 — V1 hardening and release

- Handle X client-side navigation, infinite scrolling, DOM recycling, expanded replies, and long-post truncation.
- Validate AI JSON, length-limit fields, and escape rendered content.
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
