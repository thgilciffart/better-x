const assert = require('node:assert/strict')
const { chromium } = require('playwright-core')
const { mkdtemp } = require('node:fs/promises')

const extension = process.env.BETTER_X_EXTENSION || require('node:path').join(__dirname, '..', 'extension')
const fixture = `<!doctype html><meta charset="utf-8">
<article><a href="/demo/status/42"><time datetime="2026-01-01">Today</time></a>
<div data-testid="User-Name"><a href="/demo">Demo</a></div>
<div data-testid="tweetText">Hello there! Follow @demo and read https://t.co/abc together. #news</div>
<button data-testid="share">Share</button><img width=100 height=50 src="https://pbs.twimg.com/media/test.jpg"></article>
<div id="layers"><div role="menu" aria-hidden="true" hidden><button role="menuitem">Copy link</button></div></div>
<script>
document.cookie = 'ct0=test-csrf; path=/'
document.addEventListener('click',e=>{if(!e.isTrusted)return;if(e.target.closest('button')?.dataset.testid==='share'){const m=layers.firstElementChild;m.hidden=false;m.removeAttribute('aria-hidden')}})
</script>`

async function copyImage(page, postLang) {
  await page.reload()
  await page.waitForFunction(() => document.documentElement.dataset.betterXQuiet === 'false')
  if (postLang) {
    await page.evaluate(lang => document.dispatchEvent(new CustomEvent('better-x:post-data', { detail: JSON.stringify([['42', { text: 'Hello there! Follow @demo and read https://t.co/abc together. #news', lang, author: { name: 'Demo', handle: 'demo' }, counts: {} }]]) })), postLang)
  }
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Copy as image' }).click()
  const toast = page.locator('[data-testid="toast"], .better-x-notice').first()
  await toast.waitFor()
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-testid="toast"], .better-x-notice')
    return node && !node.hasAttribute('data-pending')
  })
  const message = (await toast.textContent())?.trim()
  assert.equal(message, 'Copied post image', 'unexpected toast: ' + message)
  return page.evaluate(async () => {
    const items = await navigator.clipboard.read()
    for (const item of items) if (item.types.includes('image/png')) {
      const buffer = await (await item.getType('image/png')).arrayBuffer()
      return { hash: Array.from(new Uint8Array(buffer).slice(0, 96)).join(','), size: buffer.byteLength }
    }
    return null
  })
}

;(async () => {
  const browser = await chromium.launchPersistentContext(await mkdtemp('/tmp/bx-lang-'), {
    channel: 'chromium',
    args: ['--load-extension=' + extension, '--disable-extensions-except=' + extension],
  })
  try {
    const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker')
    await browser.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://x.com' })
    const page = await browser.newPage()
    page.setDefaultTimeout(25000)
    const grok = []
    const google = []
    await browser.route('https://api.x.com/**', async route => {
      const request = route.request()
      const body = request.postDataJSON()
      grok.push({ url: request.url(), auth: request.headers()['authorization'], csrf: request.headers()['x-csrf-token'], body })
      const chunks = [
        { result: { content_type: 'POST', text: 'translated ', entities: {} } },
        { result: { content_type: 'POST', text: 'by grok', entities: {} } },
      ]
      await route.fulfill({ headers: { 'access-control-allow-origin': 'https://x.com', 'access-control-allow-credentials': 'true' }, body: chunks.map(chunk => JSON.stringify(chunk)).join('\n') })
    })
    await browser.route('https://translate.googleapis.com/**', async route => {
      const url = new URL(route.request().url())
      google.push({ tl: url.searchParams.get('tl'), queries: url.searchParams.getAll('q') })
      await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(url.searchParams.getAll('q').map(text => [text.toUpperCase(), 'en'])) })
    })
    await browser.route('https://x.com/**', route => route.fulfill({ contentType: 'text/html', body: fixture }))
    await browser.route('https://pbs.twimg.com/**', route => route.fulfill({ contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"></svg>' }))
    await page.goto('https://x.com/home')
    await page.waitForFunction(() => document.documentElement.dataset.betterXQuiet === 'false')

    await worker.evaluate(() => chrome.storage.local.set({ copyImage: true }))
    await worker.evaluate(() => chrome.storage.local.set({ imageExport: { surface: 'ios-timeline', width: 430, dpr: 3, theme: 'dark', expanded: false, autoExpand: true, language: '' } }))
    const plain = await copyImage(page)
    assert.equal(grok.length, 0, 'no translation with language off')
    assert.equal(google.length, 0, 'no translation with language off')

    await worker.evaluate(() => chrome.storage.local.set({ imageExport: { surface: 'ios-timeline', width: 430, dpr: 3, theme: 'dark', expanded: false, autoExpand: true, language: 'ja' } }))
    const translated = await copyImage(page)

    assert.equal(grok.length, 1, 'Grok should be asked once')
    assert.equal(grok[0].body.id, '42', 'Grok gets the post id')
    assert.equal(grok[0].body.dst_lang, 'ja')
    assert.equal(grok[0].body.include_polls, true)
    assert.equal(grok[0].csrf, 'test-csrf', 'ct0 cookie becomes x-csrf-token')
    assert.match(grok[0].auth, /^Bearer AAAA/)
    assert.equal(google.length, 0, 'Google is not used when Grok answers')
    assert.notEqual(translated.hash, plain.hash, 'translated render must differ from the original')

    await browser.unroute('https://api.x.com/**')
    await browser.route('https://api.x.com/**', route => route.fulfill({ status: 401, body: '' }))
    const fallback = await copyImage(page)
    assert.equal(google.length, 1, 'a Grok failure falls back to Google')
    const sent = google[0].queries.join(' ')
    assert.ok(sent.includes('Hello there!'), 'prose goes to Google, got ' + JSON.stringify(google[0].queries))
    assert.ok(!google[0].queries.some(text => /t\.co|@demo|#news/.test(text)), 'links, mentions, and hashtags stay out')
    assert.notEqual(fallback.hash, plain.hash)

    await browser.unroute('https://translate.googleapis.com/**')
    await browser.route('https://translate.googleapis.com/**', route => route.abort())
    const offline = await copyImage(page)
    assert.equal(offline.hash, plain.hash, 'a failed translation falls back to the original text')

    await worker.evaluate(() => chrome.storage.local.set({ imageExport: { surface: 'ios-timeline', width: 430, dpr: 3, theme: 'dark', expanded: false, autoExpand: true, language: 'ja' } }))
    await browser.unroute('https://api.x.com/**')
    await browser.route('https://api.x.com/**', async route => { grok.push({ body: route.request().postDataJSON() }); await route.fulfill({ body: '{"result":{"text":"nope"}}' }) })
    await browser.unroute('https://translate.googleapis.com/**')
    await browser.route('https://translate.googleapis.com/**', async route => { google.push({}); await route.abort() })
    const before = { grok: grok.length, google: google.length }
    const sameLanguage = await copyImage(page, 'ja')
    assert.equal(grok.length, before.grok, 'a same-language post should not ask Grok')
    assert.equal(google.length, before.google, 'a same-language post should not ask Google')
    assert.equal(sameLanguage.hash, plain.hash, 'a post already in the target language is left alone')
    console.log('PASS: Grok translates posts first, Google covers its failures with links/mentions/hashtags kept, same-language posts are skipped, and failures render the original')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
