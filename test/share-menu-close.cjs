const assert = require('node:assert/strict')
const { chromium } = require('playwright-core')
const extension = process.env.BETTER_X_EXTENSION || require('node:path').join(__dirname, '..', 'extension')
const fixture = `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#000;color:#fff}
  article{position:relative;width:560px;padding:12px;border-bottom:1px solid #222}
  #layers .mask{position:fixed;inset:0;background:rgba(0,0,0,.4)}
  #layers [role=menu]{position:fixed;left:200px;top:120px;display:flex;flex-direction:column;min-width:200px;background:#16181c;padding:8px 0}
  #layers [role=menu][data-closed]{display:none}
  [role=menuitem]{all:unset;display:block;padding:10px 16px;cursor:pointer}
</style>
<article><a href="/demo/status/42"><time datetime="2026-01-01">Today</time></a>
<div data-testid="User-Name"><a href="/demo">Demo</a></div><div data-testid="tweetText">Hello there</div>
<div role="group"><button data-testid="share">Share</button></div></article>
<div id="layers"></div>
<script>
const layers = document.getElementById('layers')
function close() {
  const menu = layers.querySelector('[role=menu]')
  if (menu) menu.dataset.closed = ''
  const mask = layers.querySelector('.mask')
  if (mask) mask.remove()
  document.querySelector('[data-testid=share]').setAttribute('aria-expanded', 'false')
}
function open() {
  layers.innerHTML = '<div class="mask"></div><div role="menu"><button role="menuitem">Send via chat</button><button role="menuitem">Copy link</button><button role="menuitem">Download video</button></div>'
  layers.querySelector('.mask').addEventListener('click', close)
  for (const item of layers.querySelectorAll('[role=menuitem]')) item.addEventListener('click', close)
  document.querySelector('[data-testid=share]').setAttribute('aria-expanded', 'true')
}
document.querySelector('[data-testid=share]').addEventListener('click', event => {
  if (!event.isTrusted) return
  event.currentTarget.getAttribute('aria-expanded') === 'true' ? close() : open()
})
</script>`

;(async () => {
  const browser = await chromium.launchPersistentContext('', { channel: 'chromium', viewport: { width: 900, height: 700 },
    args: ['--load-extension=' + extension, '--disable-extensions-except=' + extension] })
  try {
    const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker')
    await worker.evaluate(() => chrome.storage.local.set({ copyImage: true, quiet: false }))
    await browser.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://x.com' })
    await browser.route('https://x.com/**', route => route.fulfill({ contentType: 'text/html', body: fixture }))
    await browser.route('https://pbs.twimg.com/**', route => route.fulfill({ contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"></svg>' }))
    const page = await browser.newPage()
    page.setDefaultTimeout(15000)
    await page.goto('https://x.com/home')
    await page.waitForFunction(() => document.documentElement.dataset.betterXQuiet === 'false')

    await page.getByRole('button', { name: 'Share', exact: true }).click()
    const menu = page.locator('#layers [role=menu]')
    await menu.waitFor({ state: 'visible' })
    await page.getByRole('menuitem', { name: 'Copy as image' }).click()
    await page.locator('[data-testid="toast"], .better-x-notice').first().waitFor()
    await page.waitForTimeout(300)
    const open = await page.evaluate(() => !document.querySelector('#layers [role=menu]')?.hasAttribute('data-closed'))
    assert.equal(open, false, 'the share menu should close after Copy as image')

    await page.getByRole('button', { name: 'Share', exact: true }).click()
    await menu.waitFor({ state: 'visible' })
    await page.getByRole('menuitem', { name: 'Download video' }).click()
    await page.waitForTimeout(300)
    const stillOpen = await page.evaluate(() => !document.querySelector('#layers [role=menu]')?.hasAttribute('data-closed'))
    assert.equal(stillOpen, false, 'the share menu should close after Download video')
    console.log('PASS: copy as image and download close the share menu like native items')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
