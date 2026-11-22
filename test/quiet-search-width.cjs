const assert = require('node:assert/strict')
const { join } = require('node:path')
const { chromium } = require('playwright-core')

const extension = process.env.BETTER_X_EXTENSION || join(__dirname, '..', 'extension')
const fixture = `<!doctype html>
<style>
  body { margin: 0; }
  main { display: flex; justify-content: center; }
  aside { flex: 0 0 350px; }
</style>
<header role="banner"><nav><a href="/home">Home</a></nav></header>
<main role="main">
  <div data-testid="primaryColumn">Timeline</div>
  <aside data-testid="sidebarColumn">
    <form role="search">
      <input data-testid="SearchBox_Search_Input" aria-label="Search">
    </form>
  </aside>
</main>`

;(async () => {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: ['--load-extension=' + extension, '--disable-extensions-except=' + extension],
  })
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker')
    await worker.evaluate(() => chrome.storage.local.set({ quiet: true, quietWidth: 800 }))
    await context.route('https://x.com/home', route => route.fulfill({ contentType: 'text/html', body: fixture }))
    const page = await context.newPage()
    await page.setViewportSize({ width: 950, height: 700 })
    await page.goto('https://x.com/home')
    await page.waitForFunction(() => document.documentElement.dataset.betterXQuiet === 'true')

    const timeline = page.getByTestId('primaryColumn')
    const search = page.locator('form:popover-open')
    const original = await timeline.boundingBox()
    assert.equal(original.width, 800)

    await page.keyboard.press('/')
    await search.waitFor()
    assert.ok(await search.getByRole('textbox', { name: 'Search' }).evaluate(input => input === document.activeElement))
    assert.deepEqual(await timeline.boundingBox(), original, 'opening search should keep the timeline size and position')

    await page.keyboard.press('Escape')
    await search.waitFor({ state: 'hidden' })
    assert.deepEqual(await timeline.boundingBox(), original, 'closing search should keep the timeline size and position')
    console.log('PASS: opening and closing Quiet Mode search keeps the 800px timeline in place')
  } finally {
    await context.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
