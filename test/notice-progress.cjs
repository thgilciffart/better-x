const assert = require('node:assert/strict')
const { chromium } = require('playwright-core')
const extension = process.env.BETTER_X_EXTENSION || require('node:path').join(__dirname, '..', 'extension')
const mp4 = 'https://video.twimg.com/amplify_video/43/vid/720/demo.mp4'
const fixture = `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#000;color:#fff}
  #layers [role=menu]{position:fixed;left:200px;top:160px;display:flex;flex-direction:column;min-width:200px;background:#16181c}
</style>
<article><a href="/demo/status/43"><time datetime="2026-01-01">Today</time></a>
<div data-testid="User-Name"><a href="/demo">Demo</a></div>
<div data-testid="tweetText">Hello there</div>
<button data-testid="share">Share</button><video src="${mp4}"></video></article>
<div id="layers"></div>
<script>
document.addEventListener('click', event => {
  if (event.target.closest('button')?.dataset.testid !== 'share') return
  layers.innerHTML = '<div role="menu"><button role="menuitem">Copy link</button><button role="menuitem" id="download">Download video</button></div>'
})
</script>`

const text = page => page.locator('.better-x-notice').first().textContent()

;(async () => {
  const browser = await chromium.launchPersistentContext('', { channel: 'chromium', viewport: { width: 900, height: 700 },
    args: ['--load-extension=' + extension, '--disable-extensions-except=' + extension] })
  try {
    const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker')
    await worker.evaluate(() => {
      globalThis.testDownloads = []
      chrome.downloads.download = async args => { testDownloads.push(args); return testDownloads.length }
    })
    await worker.evaluate(() => chrome.storage.local.set({ copyImage: true, downloads: true, quiet: false, imageExport: { surface: 'web-timeline', width: 600, dpr: 2, theme: 'dark', expanded: false, autoExpand: true, language: 'ja' } }))
    await browser.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://x.com' })
    const page = await browser.newPage()
    page.setDefaultTimeout(20000)
    await browser.route('https://api.x.com/**', async route => {
      const cors = {
        'access-control-allow-origin': 'https://x.com',
        'access-control-allow-credentials': 'true',
        'access-control-allow-headers': 'authorization, content-type, x-csrf-token',
        'access-control-allow-methods': 'POST',
      }
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
      await new Promise(resolve => setTimeout(resolve, 600))
      await route.fulfill({ headers: cors, body: '{"result":{"text":"こんにちは"}}' })
    })
    await browser.route('https://x.com/**', route => route.fulfill({ contentType: 'text/html', body: fixture }))
    await browser.route('https://video.twimg.com/**', route => route.abort())
    await page.goto('https://x.com/home')
    await page.waitForFunction(() => document.documentElement.dataset.betterXQuiet === 'false')

    await page.getByRole('button', { name: 'Share', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Copy as image' }).click()
    const toast = page.locator('.better-x-notice').first()
    await toast.waitFor()
    const pending = await toast.evaluate(node => ({ text: node.textContent, pending: node.hasAttribute('data-pending'), busy: node.getAttribute('aria-busy') }))
    assert.equal(pending.text, 'Copying', 'shows "Copying" while the image renders, got ' + pending.text)
    assert.equal(pending.pending, true, 'the toast is marked pending')
    assert.equal(pending.busy, 'true', 'pending toast sets aria-busy')
    await page.waitForFunction(() => document.querySelector('.better-x-notice')?.textContent === 'Copied post image', null, { timeout: 15000 })
    const settled = await toast.evaluate(node => ({ pending: node.hasAttribute('data-pending'), busy: node.getAttribute('aria-busy') }))
    assert.equal(settled.pending, false, 'pending flag clears when the copy settles')
    assert.equal(settled.busy, null, 'aria-busy clears when the copy settles')

    await page.getByRole('button', { name: 'Share', exact: true }).click()
    await page.locator('#download').click()
    await page.waitForFunction(() => document.querySelector('.better-x-notice')?.textContent === 'Downloading', null, { timeout: 10000 })
    assert.equal(await toast.evaluate(node => node.hasAttribute('data-pending')), true, 'download stays pending while Chrome downloads')
    assert.equal((await worker.evaluate(() => testDownloads.length)), 1, 'the download was requested')
    await worker.evaluate(async () => {
      for (const tab of await chrome.tabs.query({})) {
        await chrome.tabs.sendMessage(tab.id, { type: 'download-state', state: 'complete' }).catch(() => {})
      }
    })
    await page.waitForFunction(() => document.querySelector('.better-x-notice')?.textContent === 'Downloaded', null, { timeout: 10000 })
    assert.equal(await toast.evaluate(node => node.hasAttribute('data-pending')), false, 'download toast settles')

    await page.waitForFunction(() => !document.querySelector('.better-x-notice'), null, { timeout: 6000 })
    console.log('PASS: copying and downloading show a pending toast that settles into the result')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
