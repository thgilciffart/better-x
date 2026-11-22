const assert = require('node:assert/strict')
const { join } = require('node:path')
const { chromium } = require('playwright-core')

const extension = process.env.BETTER_X_EXTENSION || join(__dirname, '..', 'extension')
const fixture = `<!doctype html><html data-theme="light"><body>
<article><div data-testid="tweetText"><a href="/explore">Explore</a></div></article>
</body></html>`

;(async () => {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: ['--load-extension=' + extension, '--disable-extensions-except=' + extension],
  })
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker')
    await worker.evaluate(() => chrome.storage.local.set({ quiet: true }))
    await context.route('https://x.com/home', route => route.fulfill({ contentType: 'text/html', body: fixture }))

    const feed = await context.newPage()
    await feed.goto('https://x.com/home')
    await feed.waitForFunction(() => document.documentElement.dataset.betterXQuiet === 'true')
    const navigation = await feed.evaluate(() => performance.timeOrigin)
    const waitForAccent = color => feed.waitForFunction(expected =>
      getComputedStyle(document.querySelector('article a')).color === expected, color)

    const popup = await context.newPage()
    await popup.goto(new URL('/popup.html', worker.url()).href)
    await popup.waitForFunction(() => !document.querySelector('select[name="quietTheme"]').matches(':disabled'))
    const theme = popup.locator('select[name="quietTheme"]')
    assert.equal(await theme.locator('option[value="x"]').textContent(), 'Default')
    const readTheme = () => popup.locator('html').evaluate(root => {
      const { colorScheme, backgroundColor } = getComputedStyle(root)
      return { colorScheme, backgroundColor }
    })
    const defaultTheme = await readTheme()
    assert.equal(defaultTheme.colorScheme, 'dark')
    await theme.selectOption('light')
    const lightTheme = await readTheme()
    assert.equal(lightTheme.colorScheme, 'light')
    assert.notEqual(lightTheme.backgroundColor, defaultTheme.backgroundColor)
    await popup.waitForFunction(() => !document.querySelector('select[name="quietTheme"]').matches(':disabled'))
    await popup.reload()
    await popup.waitForFunction(() => !document.querySelector('select[name="quietTheme"]').matches(':disabled'))
    assert.deepEqual(await readTheme(), lightTheme)
    await theme.selectOption('dark')
    assert.deepEqual(await readTheme(), defaultTheme)
    await theme.selectOption('x')
    assert.deepEqual(await readTheme(), defaultTheme)

    const reset = popup.locator('#reset-accent')
    const picker = popup.locator('input[name="quietAccent"]')
    const custom = picker.locator('..')
    assert.equal(await reset.isVisible(), false)

    const yellow = popup.getByRole('button', { name: 'Yellow', exact: true })
    await yellow.click()
    await waitForAccent('rgb(255, 212, 0)')
    await yellow.and(popup.locator('[data-selected]')).waitFor()
    assert.equal(await reset.isVisible(), false)

    await picker.evaluate(input => {
      input.value = '#a32fdd'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await waitForAccent('rgb(163, 47, 221)')
    await reset.waitFor()
    const swatchColor = () => custom.evaluate(label => getComputedStyle(label).backgroundColor)
    assert.equal(await swatchColor(), 'rgb(163, 47, 221)')

    await yellow.click()
    await waitForAccent('rgb(255, 212, 0)')
    await reset.waitFor({ state: 'hidden' })
    await popup.reload()
    await popup.waitForFunction(() => !document.querySelector('select[name="quietTheme"]').matches(':disabled'))
    assert.equal(await picker.inputValue(), '#a32fdd')
    assert.equal(await swatchColor(), 'rgb(163, 47, 221)')
    assert.equal(await reset.isVisible(), false)

    await picker.dispatchEvent('click')
    await waitForAccent('rgb(163, 47, 221)')
    await reset.waitFor()

    await reset.click()
    await waitForAccent('rgb(29, 155, 240)')
    await reset.waitFor({ state: 'hidden' })
    assert.equal(await swatchColor(), 'rgba(0, 0, 0, 0)')
    assert.equal(await feed.evaluate(() => performance.timeOrigin), navigation)
    console.log('PASS: the popup theme and feed accents update live, and the custom swatch retains its colour until reset')
  } finally {
    await context.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
