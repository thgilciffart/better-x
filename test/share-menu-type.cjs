const assert = require('node:assert/strict')
const { chromium } = require('playwright-core')
const extension = process.env.BETTER_X_EXTENSION || require('node:path').join(__dirname, '..', 'extension')
const fixture = `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#000;color:#fff;font:400 15px/20px "Times New Roman", serif}
  #layers{display:none}
  #layers.open{display:block}
  #layers [role=menu]{position:fixed;left:200px;top:120px;display:flex;flex-direction:column;min-width:220px;background:#16181c;padding:4px 0}
  #layers [role=menuitem]{display:flex;align-items:center;gap:12px;min-height:44px;padding:12px 16px;cursor:pointer;border:0;background:none;color:#e7e9ea;text-align:start}
  #layers .native span{font:700 15px/20px TwitterChirp, "Segoe UI", Roboto, sans-serif}
  #layers svg{width:20px;height:20px;flex:none}
</style>
<article><a href="/demo/status/42"><time datetime="2026-01-01">Today</time></a>
<div data-testid="User-Name"><a href="/demo">Demo</a></div>
<div data-testid="tweetText">Hello there</div>
<div role="group"><button data-testid="share">Share</button></div></article>
<div id="layers"></div>
<script>
document.querySelector('[data-testid=share]').addEventListener('click', () => {
  if (!event.isTrusted) return
  layers.classList.add('open')
  layers.innerHTML = '<div role="menu"><button role="menuitem" class="native"><svg></svg><span>Send via Chat</span></button><button role="menuitem" class="native"><svg></svg><span>Copy link</span></button></div>'
})
</script>`

;(async () => {
  const browser = await chromium.launchPersistentContext('', { channel: 'chromium', viewport: { width: 900, height: 700 },
    args: ['--load-extension=' + extension, '--disable-extensions-except=' + extension] })
  try {
    const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker')
    await worker.evaluate(() => chrome.storage.local.set({ copyImage: true, quiet: false, quietFont: '' }))
    await browser.route('https://x.com/**', route => route.fulfill({ contentType: 'text/html', body: fixture }))
    const page = await browser.newPage()
    page.setDefaultTimeout(15000)
    await page.goto('https://x.com/home')
    await page.waitForFunction(() => document.documentElement.dataset.betterXQuiet === 'false')
    await page.getByRole('button', { name: 'Share', exact: true }).click()
    const ours = page.getByRole('menuitem', { name: 'Copy as image' })
    await ours.waitFor()
    const read = locator => locator.evaluate(node => {
      const label = node.querySelector('span') ?? node
      const style = getComputedStyle(label)
      const box = node.getBoundingClientRect()
      return {
        family: style.fontFamily.split(',')[0].replaceAll('"', ''),
        size: style.fontSize,
        weight: style.fontWeight,
        height: Math.round(box.height),
        pad: getComputedStyle(node).padding,
      }
    })
    const mine = await read(ours)
    const native = await read(page.locator('#layers [role=menuitem]').first())
    assert.equal(mine.family, 'TwitterChirp', 'the label uses X\'s font, not the menu\'s serif fallback, got ' + mine.family)
    assert.equal(mine.weight, '700', 'the label is as bold as X\'s menu labels, got ' + mine.weight)
    assert.equal(mine.family, native.family, 'same family as native rows')
    assert.equal(mine.size, native.size, 'same size as native rows: ' + mine.size + ' vs ' + native.size)
    assert.equal(mine.weight, native.weight, 'same weight as native rows: ' + mine.weight + ' vs ' + native.weight)
    assert.equal(mine.height, native.height, 'same row height: ' + mine.height + ' vs ' + native.height)
    assert.equal(mine.pad, native.pad, 'same padding as native rows')

    await worker.evaluate(() => chrome.storage.local.set({ quiet: true }))
    await page.waitForFunction(() => document.documentElement.dataset.betterXQuiet === 'true')
    const quiet = await read(ours)
    assert.equal(quiet.family, 'TwitterChirp', 'quiet mode keeps a sane family, got ' + quiet.family)
    assert.equal(quiet.weight, '400', 'quiet mode keeps the row weight')
    console.log('PASS: the injected row matches X\'s menu typography in both modes (' + mine.size + '/' + mine.weight + ')')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
