# Privacy Policy

Effective date: August 24, 2026

X Digest is a local-first, bring-your-own-key Chrome extension. It has no application backend, analytics, advertising, or telemetry service.

## Data X Digest handles

When you use a feature, the extension may handle:

- the status ID, URL, visible author information, timestamp, and text of an X post already rendered on the page;
- text you explicitly select and the visible post context needed to explain it;
- AI-generated translations, summaries, explanations, and request timing information;
- Library and Wordbook records you choose to save;
- the DeepSeek API key you enter in settings.

X Digest does not request or read your X password, login token, cookies, official Bookmarks, Likes, private archive, or account history. It does not call the X API.

## How page content is used

P1 reads only post content that X has already rendered in the page you are viewing. It does not automatically crawl your timeline or open hidden reply branches.

For AI features, the relevant post text, selected text, and prompt are sent directly from the extension to DeepSeek only after an action such as translation, summarization, explanation, or bilingual saving. DeepSeek's handling of those requests is governed by its own terms and privacy policy.

If a structured AI response cannot be parsed or validated, X Digest may make one automatic format-repair request to DeepSeek. That repair request contains the expected output contract and the first candidate response, which may itself contain post-derived text, but it does not resend the original X post evidence. The repair instruction asks the model to preserve content and fix only JSON syntax or field shape.

## Local storage

Settings, your API key, Library records, Wordbook records, and cached learning results are stored in `chrome.storage.local` in your current Chrome profile. They remain there until you remove them, clear the extension's storage, uninstall the extension, or delete the relevant Chrome profile.

Performance logs contain action names and elapsed times only. They do not contain post text, selected text, saved records, or API keys.

## Permissions

X Digest requests only permissions needed for its current features:

- `sidePanel` to show the reading and learning interface;
- `storage` to keep settings and learning records locally;
- host access to `x.com` and `twitter.com` to recognize rendered posts;
- host access to DeepSeek to make user-triggered AI requests.

## Removing your data

You can remove individual Library or Wordbook records inside the extension. To remove all local X Digest data, clear the extension's site data in Chrome or uninstall the extension. Before clearing data, export Markdown if you want to keep a copy.

## Changes

If the extension later adds a backend, analytics, cloud sync, new providers, or broader X access, this policy and the requested permissions must be updated before release.
