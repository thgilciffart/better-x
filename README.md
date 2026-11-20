# Better X

Better X is a Manifest V3 extension for X on Chrome 120+ and compatible Chromium browsers.

## Install

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Select **Load unpacked** and choose the [extension](extension/) directory.
3. Refresh any open X tabs. Open **Better X** in the toolbar to change settings.

## Use Xeet for image exports

Run `npm ci` and `npm run setup:xeet` from the repository with Node 20 or newer. Reload Better X at `chrome://extensions` and refresh X.

Setup installs the pinned Xeet WebAssembly build and its font packs into your local extension folder. **Copy as image** uses that bundle to render locally using data X has already loaded. If the bundle is missing, the copy action tells you how to set it up.

Xeet's source and bundled reference fonts have separate license terms. [Xeet license notes](https://github.com/rauchg/xeet#license)

## Use

- **Privacy** blocks promoted timeline entries and known X event and error-reporting endpoints. Turn on **Skip 18+ interstitials** to suppress the client prompt in supported timelines and post views.
- **Sharing** rewrites the status URL that X's **Copy link** puts on your clipboard to your **Link domain**, such as x.com, vxtwitter.com, or fxtwitter.com. **Clean copied links** also strips X's tracking parameters. **Copy as image** puts a locally rendered PNG on your clipboard and keeps the share menu open.
- **Image Export** sets the PNG's layout, width, pixel density, and theme. **Auto** follows the X page theme. **Expanded Text** uses the full text available to the browser. **Auto-expand “Show more”** also does this for posts with a visible expansion link.
- **Direct downloads** adds media actions to X’s right-click menu. **Copy video address** and **Copy GIF address** copy the media's MP4 address instead of a post link, and X's **Copy photo link** is hidden in favour of **Copy image address**. In X's photo viewer and in fullscreen, where X shows no menu of its own, Better X opens its own X-style menu with the same actions. Shift-right-click still opens the browser's menu, which has **Download photo** for X photos. **Download video** in X's share menu downloads directly instead of asking for Premium. X delivers animated GIFs as MP4, so the download uses that format.
- **Quiet Mode** hides the right sidebar, the account switcher, and the floating Grok and Chat buttons, and turns X into lowercase text without icons. The left navigation, its collapsed rail, and the mobile tab bar show plain labels with unread counts as numbers. Posts show a muted likes, reposts, and replies summary, with text actions on hover. **liked**, **reposted**, and **saved** stay visible with an accent underline. Post pages get a full text action row, and menus and toasts drop their icons and colour. While Quiet Mode is on, **Theme** forces X's dark or light theme without changing X's own setting (reload X to apply). **Accent colour** sets underlines and links. **Feed width**, **Font size**, and **Font** adjust the feed, and the font can be any installed font. It's black on dark and stays light on light. Columns stay where X puts them.
- **Navigation** shows or hides each supported sidebar item. These settings also work with Quiet Mode off.

Reload X after changing the ad or age-interstitial setting if you want to refetch already loaded posts. The age toggle affects the client prompt. X's server-side eligibility rules still apply.

Telemetry blocking covers `jot/client_event.json`, `graphql/user_flow.json`, and `graphql/error_log.json` on X and Twitter API hosts. Clean links drop the query and fragment, including the `a` and `s` share parameters. Links copied at a video's current time keep only the timestamp and stay on x.com.

The extension renders images locally using post content already on the page and media from X's image CDN. It uses media URLs already delivered to the browser for downloads. X can change its menus and feed data, so availability can vary with language, layout, and account.

The privacy rules draw on [uBlock Origin's filter list](https://github.com/uBlockOrigin/uAssets/blob/master/filters/filters.txt) and [X telemetry investigation](https://github.com/uBlockOrigin/uAssets/issues/33072). Media selection follows the [Cobalt extractor](https://github.com/imputnet/cobalt/blob/main/api/src/processing/services/twitter.js). [Cody Collier's video](https://x.com/codycollier/status/2119780776095121848) informed Quiet Mode.
