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

Xeet has the Chirp and Arial fonts built in. Other scripts, symbols, and emoji use font packs, which are not in the repository. The first image that needs a pack downloads it from Xeet's site, checks its SHA-256 against `packs.json`, and caches it. The packs range from 36 KB for Hebrew to 29 MB for CJK, and the emoji pack is 20 MB.

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
- **Copy posts as images** adds **Copy as image** to the share menu. The PNG uses post data that 𝕏 has already loaded.
- **Direct downloads** adds media actions to 𝕏's right-click menu.
  - A photo menu gets **Copy image**, **Copy image address**, **Open image in new tab**, and **Download photo**. 𝕏's **Copy photo link** is hidden.
  - A video menu gets **Copy video address**, **Copy video frame**, **Open video in new tab**, and **Download video**. A GIF menu gets the same actions for the GIF. The address is the MP4 file, not a post link. 𝕏 serves GIFs as MP4.
  - In 𝕏's photo viewer and in fullscreen, better 𝕏 shows its own menu with the same actions. Shift-right-click opens the browser menu, which has **Download photo**.
  - **Download video** in 𝕏's share menu downloads the file. 𝕏's Premium prompt does not appear.

### Appearance

**Quiet Mode** shows 𝕏 as lowercase text without icons. It hides the right sidebar, the account switcher, and the floating Grok and Chat buttons. Unread badges become numbers. Posts show a summary of likes, reposts, and replies, and the actions appear on hover. 𝕏's columns stay in place.

Select **Search** in Quiet Mode or press **/** to open the search overlay. Press **Enter** to view the results on 𝕏.

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
