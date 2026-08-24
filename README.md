# X Digest

Turn posts, threads, and replies that you are already reading on X into contextual English-learning material.

X Digest is a local-first Chrome extension. V1 is designed to add an inline **Digest** action to posts and replies, preserve conversation context, translate or explain expressions with a user-provided AI key, save learning records locally, and export Markdown.

## Current status

P1 implements the core single-post learning loop:

- inline Digest actions for currently rendered X posts and replies;
- Original, Chinese, and bilingual reading modes;
- opt-in DeepSeek translation, short Digest summaries, and selected-text explanations;
- a local Saved Library and unified Wordbook with stable duplicate upgrades;
- Saved Library, Wordbook, and complete Markdown snapshot exports;
- provider-specific missing-key, authentication, rate-limit, network, and timeout errors.

Automated tests cover the provider contract, AI payload validation, stable IDs, duplicate upgrades, and Markdown exports. Real-page compatibility still needs manual verification after loading the extension in Chrome; DOM compatibility is not implied by the automated tests.

See [docs/ROADMAP.md](docs/ROADMAP.md) for the complete V1 and V2 scope.

## Privacy baseline

- No X API, account password, or session-token access in V1.
- No automatic background collection.
- AI calls are opt-in and use the user's own key.
- Saved posts and settings remain in the current Chrome profile.
- API keys must never be placed in source files or chat messages.

## Development

```bash
npm test
```

Load the project folder through `chrome://extensions` → **Developer mode** → **Load unpacked**.
