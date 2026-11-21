const assert = require('node:assert/strict')
const { chromium } = require('playwright-core')
const fs = require('fs')
const extension = process.env.BETTER_X_EXTENSION || require('node:path').join(__dirname, '..', 'extension')
const { mkdtemp, cp } = require('node:fs/promises')

const fixture = (text) => `<!doctype html><meta charset="utf-8">
<article><a href="/demo/status/42"><time datetime="2026-01-01">Today</time></a>
<div data-testid="User-Name"><a href="/demo">Demo</a></div><div data-testid="tweetText">${text}</div>
<button data-testid="share">Share</button><img width=100 height=50 src="https://pbs.twimg.com/media/test.jpg"></article>
<div id="layers"><div role="menu" aria-hidden="true" hidden><button role="menuitem">Copy link</button></div></div>
<script>
document.addEventListener('click',event=>{
 if(!event.isTrusted)return
 if(event.target.closest('button')?.dataset.testid==='share'){
   const menu=layers.firstElementChild
   menu.hidden=false
   menu.removeAttribute('aria-hidden')
 }
})
</script>`

async function run(extension, label, text) {
  const browser = await chromium.launchPersistentContext(await mkdtemp('/tmp/bx-fonts-'), {
    channel: 'chromium',
    args: ['--load-extension=' + extension, '--disable-extensions-except=' + extension],
  })
  try {
    const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker')
    await browser.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://x.com' })
    await worker.evaluate(() => chrome.storage.local.set({ copyImage: true, quiet: false, imageExport: { surface: 'ios-timeline', width: 430, dpr: 3, theme: 'dark', expanded: false, autoExpand: true } }))
    const page = await browser.newPage()
    page.setDefaultTimeout(20000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await browser.route('https://x.com/**', route => route.fulfill({ contentType: 'text/html', body: fixture(text) }))
    await browser.route('https://pbs.twimg.com/**', route => route.fulfill({ contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"></svg>' }))
    await page.goto('https://x.com/home')
    await page.waitForFunction(() => document.documentElement.dataset.betterXQuiet === 'false')
    await page.getByRole('button', { name: 'Share', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Copy as image' }).click()
    const toast = page.locator('[data-testid="toast"], .better-x-notice').first()
    await toast.waitFor()
    await page.waitForFunction(() => {
      const node = document.querySelector('[data-testid="toast"], .better-x-notice')
      return node && !node.hasAttribute('data-pending')
    })
    const message = (await toast.textContent())?.trim()
    assert.equal(message, 'Copied post image', `${label}: expected a copied image, got "${message}"`)
    const size = await page.evaluate(async () => {
      const items = await navigator.clipboard.read()
      for (const item of items) if (item.types.includes('image/png')) return (await item.getType('image/png')).size
      return 0
    })
    assert.ok(size > 20000, `${label}: clipboard PNG too small (${size})`)
    assert.deepEqual(errors, [], label + ': page errors')
    console.log(label, '->', message, size + 'b')
  } finally { await browser.close() }
}

;(async () => {
  const text = 'emoji 😀🎉 こんにちは 日本語 עברית مرحبا'
  const withFonts = await mkdtemp('/tmp/bx-ext-fonts-')
  await cp(extension, withFonts + '/extension', { recursive: true })
  await run(withFonts + '/extension', 'bundled packs', text)

  const without = await mkdtemp('/tmp/bx-ext-nofonts-')
  await cp(extension, without + '/extension', { recursive: true })
  for (const name of fs.readdirSync(without + '/extension/vendor/xeet/fonts')) {
    if (name.endsWith('.bin')) fs.rmSync(without + '/extension/vendor/xeet/fonts/' + name)
  }
  await run(without + '/extension', 'cdn fallback', text)
  console.log('PASS: emoji, CJK, Hebrew, and Arabic copy as image works from bundled packs and from the pinned CDN fallback')
})().catch(error => { console.error(error); process.exitCode = 1 })
