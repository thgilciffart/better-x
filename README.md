# better 𝕏

better 𝕏 is a Manifest V3 extension for 𝕏. It runs on Chrome 120 or newer and on other Chromium browsers.

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Select **Load unpacked**.
4. Choose the [`extension`](extension/) folder.
5. Refresh your 𝕏 tabs.

Open **better 𝕏** from the toolbar to change settings. After you change the extension files, reload better 𝕏 at `chrome://extensions` and refresh 𝕏.

## Copy as image

**Copy as image** renders posts locally with [Xeet](https://github.com/rauchg/xeet). The pinned Xeet build ships in `extension/vendor/xeet` under its [Apache 2.0 license](extension/vendor/xeet/LICENSE).

Xeet has the Chirp and Arial fonts built in. Other scripts, symbols, and emoji use font packs. A pack in `extension/vendor/xeet/fonts` is read from disk; when it is missing, the first image that needs it downloads the pack from the pinned `@xeet/core` build on jsDelivr, checks its SHA-256 against `packs.json`, and caches it. The packs range from 33 KB for Hebrew to 28 MB for CJK, and the emoji pack is 20 MB.

**Language** under **Image Export** translates post text before it is rendered. Links, mentions, hashtags, and cashtags are sent as written, and a post whose translation fails is rendered unchanged. Translation uses the public Google Translate endpoint, so the post text leaves the browser; the setting is off by default.

To update the pinned build, run `npm ci` and then `npm run update:xeet`. You need Node 20 or newer.

## Settings

### Privacy

- **Block ads** removes promoted posts from timelines.
- **Block telemetry** blocks requests to `jot/client_event.json`, `graphql/user_flow.json`, and `graphql/error_log.json` on 𝕏 and Twitter API hosts.
- **Skip 18+ interstitials** removes 𝕏's age prompt in timelines and post views. 𝕏's server-side rules still apply.

Reload 𝕏 after you change **Block ads** or **Skip 18+ interstitials**. Posts that are already loaded keep the old setting.

### Sharing

- **Link domain** sets the host of links that 𝕏's **Copy link** puts on the clipboard, for example `vxtwitter.com` or `fxtwitter.com`.
- **Clean copied links** removes the query and fragment from those links, including the `a` and `s` tracking parameters. A link copied at a video's current time keeps `t` and stays on `x.com`.
- **Copy current page link** is an optional keyboard shortcut in `chrome://extensions/shortcuts`. It uses the same link settings for supported 𝕏 post URLs and copies other page addresses as shown.
- **Share** and **More** open 𝕏's native menus. With **Direct downloads** enabled, Share downloads videos through Better 𝕏.
- **Copy posts as images** adds **Copy as image** at the end of Share. The PNG uses post data that 𝕏 has already loaded.
- **Direct downloads** enables better 𝕏's media menu in the timeline, viewer, and fullscreen. Shift-right-click opens the original menu.
  - Photos offer **Copy image**, **Copy image address**, **Open image in new tab**, and **Download image**.
  - Videos and GIFs offer their MP4 address, frame copying, and direct download when available.

### Appearance

**Quiet Mode** shows 𝕏 as lowercase text without icons. It hides the right sidebar, the account switcher, and the floating Grok and Chat buttons. Unread badges become numbers. Posts show a summary of likes, reposts, and replies, and the actions appear on hover. 𝕏's columns stay in place.

Select **search** in Quiet Mode or press **/**. Explore and search results use 𝕏's inline search field. On other pages, the shortcut can open a search panel. Press **Enter** to view results.

These settings work with Quiet Mode on or off. Reset a field to let 𝕏 choose its default, or to use the Quiet Mode default when Quiet Mode is on.

- **Theme** forces 𝕏's dark or light theme. 𝕏's own setting does not change. Reload 𝕏 after you change it.
- **Accent colour** sets the underline and link color.
- **Feed width (px)** sets the width of the feed.
- **UI font size (px)** sets the size of navigation, tabs, labels, and menus.
- **Text font size (px)** sets the size of post text and names.
- **Font** accepts any installed font. Leave it empty to use 𝕏's font.
- **Emoji Font** changes the artwork for emoji images on 𝕏. Expand **Emoji Downloads** in Appearance to download individual fonts, then choose a downloaded font in the dropdown. **𝕏 default** restores 𝕏's original emoji.

### Navigation

**Navigation** shows or hides each item in 𝕏's left menu. It works with Quiet Mode on or off.

### Image Export

**Image Export** sets the layout, width, pixel density, and theme of **Copy as image**. The **Auto** theme follows the 𝕏 page. **Expanded Text** uses the full post text. **Auto-expand "Show more"** uses the full text for posts that show a **Show more** link.

### About

**About** shows the version, source repository, and storage used by settings and downloaded fonts. **Clear Font Caches** removes downloaded emoji and image export fonts and resets the emoji font to **𝕏 default**. Image export downloads the packs it needs on demand.

## Limits

𝕏 changes its menus and feed data often. Menu detection uses 𝕏's English labels, so some features may not work in other languages.

## Credits

The privacy rules use [uBlock Origin's filters](https://github.com/uBlockOrigin/uAssets/blob/master/filters/filters.txt) and its [𝕏 telemetry investigation](https://github.com/uBlockOrigin/uAssets/issues/33072). Media selection follows [Cobalt's 𝕏 extractor](https://github.com/imputnet/cobalt/blob/main/api/src/processing/services/twitter.js). Quiet Mode follows [Cody Collier's video](https://x.com/codycollier/status/2119780776095121848).
