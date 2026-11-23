# better 𝕏

A chrome web extension aimed to making [𝕏](https://x.com) a more pleasant experience.

# Features

- Disabling ads, telemetry[^telemetry] and the 18+ warning
- Removing tracking identifiers in shared links and having a default base url instead (like vxtwitter)
- Directly downloading media
- Adjusting appearance (font, font size, feed width, etc)
- Quiet mode (a debloated theme)
- Disabling navigation tabs
- Exporting posts as images via [xeet](https://github.com/rauchg/xeet)

# Requirements

- Chrome 120 or newer, or a Chromium-based browser with equivalent extension support

# Installation

1. Download and extract the `better-x-v*.zip` file from the [latest release](https://github.com/thgilciffart/better-x/releases/latest).
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the folder containing `manifest.json`.
5. Refresh any open 𝕏 tabs.

If you cloned this repository, select the [`extension`](extension/) folder in step 4.

# Credits

- Privacy rules draw on [uBlock Origin's filters](https://github.com/uBlockOrigin/uAssets/blob/master/filters/filters.txt) and its [𝕏 telemetry investigation](https://github.com/uBlockOrigin/uAssets/issues/33072).
- Media selection follows [Cobalt's 𝕏 extractor](https://github.com/imputnet/cobalt/blob/main/api/src/processing/services/twitter.js).
- Quiet Mode takes inspiration from [Cody Collier's video](https://x.com/codycollier/status/2119780776095121848).
- The extension bundles [xeet](https://github.com/rauchg/xeet) under the [Apache 2.0 licence](extension/vendor/xeet/LICENSE).
- Translation badges use the [Grok icon from Dashboard Icons](https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/grok.svg) and the [Google Translate logo from Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Google_Translate_logo.svg).

[^telemetry]: The block list covers endpoints for client events, error logs, attribution, and ad measurement. See the [full telemetry rules](extension/telemetry.json).
