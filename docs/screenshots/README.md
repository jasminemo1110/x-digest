# Public screenshot checklist

Use fresh screenshots from the current public-beta build. Do not reuse older development screenshots that show obsolete UI or known bugs.

## Included images

| File | Show | Suggested crop |
| --- | --- | --- |
| `overview.png` | A public X post, visible Digest actions, and aligned bilingual reading | Browser chrome and personal navigation are removed |
| `summary.png` | A long public post beside its structured summary | Browser chrome, personal navigation, and an unrelated provider error are removed |
| `article-summary-navigation.png` | A rendered Article with sectioned Summary, Markdown export, and source navigation | Keep the annotated end-to-end reading flow readable |
| `explain-trigger.png` | The floating Explain action next to the active selection | Current Reader card only |
| `explain-card.png` | Naturalness, IPA, meaning, usage, example, and saved feedback | Complete learning dialog |
| `excerpt-save.png` | Immediate Library feedback after saving selected text with `N` | Selection and floating feedback only |
| `library.png` | One excerpt and one whole-post bilingual save | Complete Library panel |
| `library-excerpt-focus.png` | A Library excerpt reopening its Article source with yellow source highlighting | Keep the Library action and highlighted sentence in one frame |
| `wordbook.png` | Structured wordbook entries with examples | Complete Wordbook panel |

## Privacy check before committing

- Use a public or synthetic post that you are comfortable reproducing in an open repository.
- Crop out notifications, direct messages, bookmarks, unrelated tabs, profile switchers, and personal browser UI.
- Never show the settings page, API key, provider balance, `chrome.storage`, DevTools requests, cookies, or logs.
- Review every visible handle, avatar, reply, timestamp, and link—not only the main post.
- Prefer PNG at a readable desktop resolution; avoid unnecessary full-screen captures.
- Confirm the UI labels and colors match the current extension.
- Open each final image once at full size before adding it to Git.

The gallery in both README files uses the same assets and localized captions.
