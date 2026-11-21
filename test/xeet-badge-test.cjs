const assert = require('node:assert/strict')
const { chromium } = require('playwright-core')
const { mkdtemp } = require('node:fs/promises')
const fs = require('fs')

const extension = process.env.BETTER_X_EXTENSION || require('node:path').join(__dirname, '..', 'extension')
const fixture = query => `<!doctype html><meta charset="utf-8">
<article><a href="/demo/status/42"><time datetime="2026-01-01">Today</time></a>
<div data-testid="User-Name"><a href="/demo">Demo</a></div>
<div data-testid="tweetText">${new URLSearchParams(query).get('text') || ''}</div>
<button data-testid="share">Share</button><img width=100 height=50 src="https://pbs.twimg.com/media/test.jpg"></article>
<div id="layers"><div role="menu" aria-hidden="true" hidden><button role="menuitem">Copy link</button></div></div>
<script>
document.cookie = 'ct0=test-csrf; path=/'
const params = new URLSearchParams(location.search)
const lang = params.get('lang') || ''
document.dispatchEvent(new CustomEvent('better-x:post-data', { detail: JSON.stringify([['42', { text: ${JSON.stringify(new URLSearchParams(query).get('text') || '')}, lang, author: { name: 'Demo', handle: 'demo' }, counts: {} }]]) }))
document.addEventListener('click',e=>{if(!e.isTrusted)return;if(e.target.closest('button')?.dataset.testid==='share'){const m=layers.firstElementChild;m.hidden=false;m.removeAttribute('aria-hidden')}})
</script>`

const size = buffer => ({ width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) })

async function copy(page, name) {
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Copy as image' }).click()
  const toast = page.locator('[data-testid="toast"], .better-x-notice').first()
  await toast.waitFor()
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-testid="toast"], .better-x-notice')
    return node && !node.hasAttribute('data-pending')
  })
  assert.equal((await toast.textContent())?.trim(), 'Copied post image')
  const data = await page.evaluate(async () => {
    const items = await navigator.clipboard.read()
    for (const item of items) if (item.types.includes('image/png')) {
      return Array.from(new Uint8Array(await (await item.getType('image/png')).arrayBuffer()))
    }
    return []
  })
  const buffer = Buffer.from(data)
  if (name) fs.writeFileSync(require('node:path').join(require('node:os').tmpdir(), 'badge-') + name + '.png', buffer)
  return buffer
}

;(async () => {
  const browser = await chromium.launchPersistentContext(await mkdtemp('/tmp/bx-badge-'), {
    channel: 'chromium',
    args: ['--load-extension=' + extension, '--disable-extensions-except=' + extension],
  })
  try {
    const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker')
    await browser.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://x.com' })
    const page = await browser.newPage()
    page.setDefaultTimeout(25000)
    const cors = {
      'access-control-allow-origin': 'https://x.com',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization, content-type, x-csrf-token',
      'access-control-allow-methods': 'POST',
    }
    const grokUp = () => browser.route('https://api.x.com/**', async route => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
      await route.fulfill({ headers: cors, body: '{"result":{"content_type":"POST","text":"本当に今は自分の問題を心配していない。","entities":{}}}' })
    })
    await grokUp()
    await browser.route('https://translate.googleapis.com/**', async route => {
      const queries = new URL(route.request().url()).searchParams.getAll('q')
      await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(queries.map(text => [text, 'zh'])) })
    })
    await browser.route('https://x.com/**', route => route.fulfill({ contentType: 'text/html', body: fixture(new URL(route.request().url()).search) }))
    await browser.route('https://pbs.twimg.com/**', route => route.fulfill({ contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"></svg>' }))

    const open = async (text, lang = '') => {
      await page.goto('https://x.com/home?text=' + encodeURIComponent(text) + '&lang=' + lang)
      await page.waitForFunction(() => document.documentElement.dataset.betterXQuiet === 'false')
    }
    const english = 'Honestly, I am not worried about my own problems right now.'
    const chinese = '说真现在我不担心自己火烧眉毛，倒担心起来国内公司了。'
    const dark = { surface: 'web-detail', width: 600, dpr: 2, theme: 'dark', expanded: false, autoExpand: true }

    await worker.evaluate(imageExport => chrome.storage.local.set({ copyImage: true, imageExport }), { ...dark, language: '' })
    await open(english)
    const plain = await copy(page)

    await worker.evaluate(imageExport => chrome.storage.local.set({ imageExport }), { ...dark, language: 'en' })
    await open(chinese)
    const grok = await copy(page, 'grok-dark')

    await browser.unroute('https://api.x.com/**')
    await browser.route('https://api.x.com/**', route => route.fulfill({ status: 401, body: '' }))
    await worker.evaluate(imageExport => chrome.storage.local.set({ imageExport }), { ...dark, theme: 'light', language: 'en' })
    await open(chinese)
    const google = await copy(page, 'google-light')

    await worker.evaluate(imageExport => chrome.storage.local.set({ imageExport }), { ...dark, language: '' })
    await open(chinese)
    const chinesePlain = await copy(page)
    await worker.evaluate(imageExport => chrome.storage.local.set({ imageExport }), { ...dark, language: 'zh' })
    await open(chinese, 'zh')
    const skipped = await copy(page, 'skipped')

    await browser.unroute('https://api.x.com/**')
    await browser.route('https://api.x.com/**', route => route.abort())
    await browser.unroute('https://translate.googleapis.com/**')
    await browser.route('https://translate.googleapis.com/**', route => route.abort())
    await worker.evaluate(imageExport => chrome.storage.local.set({ imageExport }), { ...dark, language: 'en' })
    await open(chinese)
    const failed = await copy(page)

    const base = size(plain)
    assert.equal(size(grok).width, base.width, 'badge keeps the width')
    assert.equal(size(grok).height - base.height, 48, 'badge adds a 24px strip at dpr 2')
    assert.equal(size(google).height - base.height, 48, 'google badge adds the same strip')
    assert.equal(size(skipped).height, size(chinesePlain).height, 'a same-language post gets no badge')
    assert.equal(size(failed).height, size(chinesePlain).height, 'a failed translation gets no badge')
    console.log('PASS: translated exports carry a provider badge strip, same-language and failed translations do not')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
