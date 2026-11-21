const assert = require('node:assert/strict')
const { chromium } = require('playwright-core')

const extension = process.env.BETTER_X_EXTENSION || require('node:path').join(__dirname, '..', 'extension')
const fixture = `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#000;color:#fff}
  article{width:560px;padding:12px}
  [data-testid=videoPlayer]{width:320px;height:180px;background:#123}
  video{width:320px;height:180px}
</style>
<article><a href="/demo/status/42"><time datetime="2026-01-01">Today</time></a>
<div data-testid="User-Name"><a href="/demo">Demo</a></div>
<div data-testid="videoPlayer"><video muted playsinline src="https://video.twimg.com/amplify_video/42/vid/720/demo.mp4" poster="https://pbs.twimg.com/media/demo.jpg"></video></div>
</article>
<script>
const player = document.querySelector('[data-testid=videoPlayer]')
const video = player.querySelector('video')
window.__presses = []
// X's player treats a press on the surface as play/pause
player.addEventListener('pointerdown', event => {
  window.__presses.push(event.button)
  if (video.paused) video.play().catch(() => {}); else video.pause()
}, true)
</script>`

;(async () => {
  const browser = await chromium.launchPersistentContext('', { channel: 'chromium', viewport: { width: 900, height: 700 },
    args: ['--load-extension=' + extension, '--disable-extensions-except=' + extension] })
  try {
    const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker')
    await worker.evaluate(() => chrome.storage.local.set({ downloads: true, quiet: false }))
    await browser.route('https://x.com/**', route => route.fulfill({ contentType: 'text/html', body: fixture }))
    await browser.route('https://video.twimg.com/**', route => route.abort())
    await browser.route('https://pbs.twimg.com/**', route => route.fulfill({ contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"></svg>' }))
    const page = await browser.newPage()
    page.setDefaultTimeout(15000)
    await page.goto('https://x.com/home')
    await page.waitForFunction(() => document.documentElement.dataset.betterXQuiet === 'false')
    await page.waitForFunction(() => document.querySelector('video').readyState >= 0)

    const player = page.locator('[data-testid=videoPlayer]')

    await player.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Download video' }).waitFor()
    const right = await page.evaluate(() => ({ presses: window.__presses, paused: document.querySelector('video').paused }))
    assert.deepEqual(right.presses, [], 'a right-button press must not reach the player, got buttons ' + JSON.stringify(right.presses))

    await page.keyboard.press('Escape')
    await page.mouse.click(10, 640)
    await page.evaluate(() => { window.__presses = []; const video = document.querySelector('video'); video.pause() })
    await player.click()
    await page.waitForTimeout(150)
    const left = await page.evaluate(() => ({ presses: window.__presses }))
    assert.deepEqual(left.presses, [0], 'a left click still reaches the player so it can toggle playback')

    console.log('PASS: right-clicking media never reaches X\'s play/pause press handler, a left click still does')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
