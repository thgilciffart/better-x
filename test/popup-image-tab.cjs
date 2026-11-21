const assert = require('node:assert/strict')
const { chromium } = require('playwright-core')
const extension = process.env.BETTER_X_EXTENSION || require('node:path').join(__dirname, '..', 'extension')
;(async () => {
  const browser = await chromium.launchPersistentContext('', { channel: 'chromium', viewport: { width: 420, height: 760 },
    args: ['--load-extension=' + extension, '--disable-extensions-except=' + extension] })
  try {
    const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker')
    const page = await browser.newPage()
    await page.goto(new URL('/popup.html', worker.url()).href)
    await page.getByRole('tab', { name: 'Image Export' }).click()
    await page.waitForTimeout(250)
    assert.equal(await page.locator('.image-export-note').count(), 0, 'the note is gone')
    const rows = await page.locator('#image-export .row').allTextContents()
    assert.equal(rows.some(text => /Translates with/i.test(text)), false, 'no translation note text remains')
    assert.ok(rows.some(text => /Language/.test(text)), 'the language row is still there')
    await page.locator('#image-export').screenshot({ path: require('node:path').join(require('node:os').tmpdir(), 'popup-image-tab.png') })
    console.log('PASS: image export panel has the language row and no note', rows.length + ' rows')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
