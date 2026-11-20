# Better X

Better X is a Manifest V3 extension for X on Chrome 120+ and compatible Chromium browsers.

## Install

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Select **Load unpacked** and choose the [extension](extension/) directory.
3. Refresh any open X tabs. Open **Better X** in the toolbar to change settings.

## Use

- **Privacy** blocks promoted timeline entries and known X event and error-reporting endpoints. Turn on **Skip 18+ interstitials** to suppress the client prompt in supported timelines and post views.
- **Sharing** replaces **Copy link** with a clean status URL. Set **Link domain** to x.com, vxtwitter.com, or fxtwitter.com. **Copy as image** puts a locally rendered PNG on your clipboard and keeps the share menu open.
- **Image Export** sets the PNG's layout, width, pixel density, theme, and font scale. Pick a preset or save your settings as a variant. **Expanded Text** uses the full text available to the browser. **Auto-expand “Show more”** also does this for posts with a visible expansion link.
- **Downloads** appear when you right-click a supported post photo, video, or animated GIF. X delivers animated GIFs as MP4, so the download uses that format.
- **Quiet Mode** uses a dark, single-feed layout with quieter navigation and post actions.
- **Navigation** shows or hides each supported sidebar item. These settings also work with Quiet Mode off.

Reload X after changing the ad or age-interstitial setting if you want to refetch already loaded posts. The age toggle affects the client prompt. X's server-side eligibility rules still apply.

Telemetry blocking covers `jot/client_event.json`, `graphql/user_flow.json`, and `graphql/error_log.json` on X and Twitter API hosts. Clean links drop the query and fragment, including the `a` and `s` share parameters.

The extension renders images locally using post content already on the page and media from X's image CDN. It uses media URLs already delivered to the browser for downloads. X can change its menus and feed data, so availability can vary with language, layout, and account.

The privacy rules draw on [uBlock Origin's filter list](https://github.com/uBlockOrigin/uAssets/blob/master/filters/filters.txt) and [X telemetry investigation](https://github.com/uBlockOrigin/uAssets/issues/33072). Media selection follows the [Cobalt extractor](https://github.com/imputnet/cobalt/blob/main/api/src/processing/services/twitter.js). [Cody Collier's video](https://x.com/codycollier/status/2119780776095121848) informed Quiet Mode.
