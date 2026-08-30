# YouTube Link Sanitizer

A Chrome extension that strips tracking parameters from YouTube links — both the ones you copy and the ones you open.

## What it does

**1. Sanitizes copied links.** When you copy a YouTube link, the tracking parameters are removed before the text reaches your clipboard. This covers every copy path:

| Copy path | Handled by |
| --- | --- |
| Share dialog → **Copy** button | `navigator.clipboard.writeText` patch |
| Player right-click → **Copy video URL** | `navigator.clipboard.writeText` patch |
| Async clipboard writes with rich content | `navigator.clipboard.write` patch |
| Ctrl+C in the share dialog's URL field | `copy` event handler |
| Ctrl+C over selected page text containing a link | `copy` event handler (sanitizes both plain text and HTML anchors) |

**2. Sanitizes navigation.** When you open a YouTube URL that carries tracking parameters — pasted into the address bar, clicked from another app, followed from an email — a `declarativeNetRequest` rule rewrites it before the request is sent, so the clean URL is what lands in your address bar and history.

`si=` is the main target. It is the share-attribution identifier YouTube appends when you use the share sheet, and it ties the link back to the account that shared it.

### What is stripped

`si`, `pp`, `feature`, `ab_channel`, `kw`, `attr_tag`, `source_ve_path`, all `embeds_*` referrer params, `themeRefresh`, every `utm_*`, and the usual third-party click IDs (`gclid`, `fbclid`, `msclkid`, `twclid`, `ttclid`, `yclid`, `igshid`, `dclid`, `mc_eid`, `mc_cid`, `vero_id`, `vero_conv`, `ref_src`, `ref_url`).

### What is never stripped

`v`, `t`, `start`, `end`, `list`, `index`, `playlist`, `search_query`, `time_continue`, `lc`, `app`, `hl`, `gl`.

These carry user intent — a timestamp, a playlist position, a linked comment. Removing them would silently change where the link points, so they are on an explicit allowlist that wins over every strip rule. Unknown parameters are also left alone; the extension only removes things it recognizes.

## Install

There is no build step. The repository *is* the extension.

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this directory
4. Confirm the card shows no errors, and that **Errors** / the ruleset warning area is clean

Requires Chrome 111 or newer (`world: "MAIN"` content scripts).

## Permissions, and why each is needed

- `host_permissions` for `*.youtube.com`, `*.youtu.be`, `*.youtube-nocookie.com` — required to run the clipboard logic on YouTube pages and to let the redirect rule apply there.
- `declarativeNetRequestWithHostAccess` — the narrow variant of the network permission. Rules apply only to hosts already granted above, so this adds no reach beyond the host permissions.

There is no `tabs` permission, no `<all_urls>`, no background service worker, no storage, and no network access of any kind. Nothing is collected or sent anywhere.

The tradeoff of this narrow scope: copying a YouTube link from a *non*-YouTube page (a tweet, a Slack message) is not sanitized, because that would require host access to every site you visit. Navigation to such links is still cleaned by the redirect rule.

## Layout

```
manifest.json     MV3 manifest
rules.json        declarativeNetRequest ruleset for the navigation redirect
src/sanitize.js   pure URL/text/HTML sanitizing logic
src/content.js    MAIN-world clipboard patches and copy handler
test/             browser-run test suites
```

`src/sanitize.js` exposes its API on `globalThis.__youtubeLinkSanitizer`; `src/content.js` reads it and immediately deletes the property, so nothing leaks into the page's global scope. Content scripts cannot use ES modules, which is why the two files share state this way.

`src/content.js` must run in the `MAIN` world. YouTube calls `navigator.clipboard.writeText` from page context, and a patch applied in an isolated world would be invisible to it.

## Tests

No Node.js required — the suites run in the browser and are also usable headlessly.

Interactive: open `test/sanitize.test.html` and `test/clipboard.test.html` in Chrome and read the output. `sanitize.test.html` needs file-URL fetch access to read `rules.json`; launch Chrome with `--allow-file-access-from-files` or serve the directory over HTTP.

Headless, from this directory:

```sh
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
"$CHROME" --headless=new --disable-gpu --allow-file-access-from-files \
  --virtual-time-budget=8000 --user-data-dir="$(pwd)/.chrome-test-profile" \
  --dump-dom "file:///$(pwd -W)/test/sanitize.test.html" \
  | sed -n '/<pre id="output">/,/<\/pre>/p' | sed 's/<[^>]*>//g'
```

Both suites print `RESULT: ALL PASS` or a list of failures.

`sanitize.test.html` also asserts that `rules.json` and `src/sanitize.js` agree on the parameter list — the two are separate sources of truth by necessity (a static ruleset cannot import JS), so the tests fail loudly if one drifts from the other. It further checks that the ruleset's regex cannot match a URL that has already been transformed, which is what rules out a redirect loop.

## Known limitations

- Copies made on non-YouTube pages are not sanitized (see Permissions above).
- Single-page navigations within YouTube are not rewritten. They are not network requests, so `declarativeNetRequest` never sees them. In practice YouTube does not add tracking parameters to its own in-app navigation.
- Embedded players (`sub_frame` requests) are deliberately left alone, since some embed parameters are load-bearing for playback.
