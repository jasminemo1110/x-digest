# Public screenshot checklist

Use fresh screenshots from the current public-beta build. Do not reuse older development screenshots that show obsolete UI or known bugs.

## Planned images

| File | Show | Suggested crop |
| --- | --- | --- |
| `digest-button.png` | A clearly visible blue Digest button on a public X post | Post card plus its action row |
| `bilingual-reader.png` | Paragraph-aligned English and Chinese in the side panel | Post text and bilingual tab; hide browser chrome if possible |
| `explain-card.png` | A selected expression and its naturalness, IPA, meaning, usage, and example | Explain card plus a small amount of source context |
| `library-wordbook.png` | Bilingual saved content and a clearly titled wordbook entry | One or two representative local records |

## Privacy check before committing

- Use a public or synthetic post that you are comfortable reproducing in an open repository.
- Crop out notifications, direct messages, bookmarks, unrelated tabs, profile switchers, and personal browser UI.
- Never show the settings page, API key, provider balance, `chrome.storage`, DevTools requests, cookies, or logs.
- Review every visible handle, avatar, reply, timestamp, and link—not only the main post.
- Prefer PNG at a readable desktop resolution; avoid unnecessary full-screen captures.
- Confirm the UI labels and colors match the current extension.
- Open each final image once at full size before adding it to Git.

After the four files are ready, add a compact gallery near the top of both README files.
