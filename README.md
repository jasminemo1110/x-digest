# X Digest

Turn posts, threads, and replies that you are already reading on X into contextual English-learning material.

X Digest is a local-first Chrome extension. V1 is designed to add an inline **Digest** action to posts and replies, preserve conversation context, translate or explain expressions with a user-provided AI key, save learning records locally, and export Markdown.

## Current status

The project is being built in small verified stages. The initial scaffold establishes:

- an independent Manifest V3 extension for `x.com`;
- inline Digest-button discovery for currently rendered posts;
- a local side panel that receives the selected post;
- local saving by stable X status ID;
- an isolated DeepSeek provider contract with no Supadata dependency.

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
