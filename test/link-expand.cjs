const assert = require('node:assert/strict')
const { chromium } = require('playwright-core')

const extension = process.env.BETTER_X_EXTENSION || require('node:path').join(__dirname, '..', 'extension')
const short = 'https://t.co/fwl8xZxsKA'
const expanded = 'https://example.com/real-page?ref=abc'
const unknown = 'https://t.co/notInTheData'

const payload = {
  data: {
    home: {
      timeline: {
        instructions: [{
          type: 'TimelineAddEntries',
          entries: [{
            entryId: 'tweet-42',
            content: {
              itemContent: {
                tweet_results: {
                  result: {
                    __typename: 'Tweet',
                    rest_id: '42',
                    legacy: {
                      full_text: `Look at this https://t.co/fwl8xZxsKA`,
                      entities: {
                        urls: [{
                          url: short,
                          expanded_url: expanded,
                          display_url: 'example.com/real-page',
                          indices: [12, 35],
                        }],
                      },
                    },
                    core: { user_results: { result: { core: { name: 'Demo', screen_name: 'demo' } } } },
                  },
                },
              },
            },
          }],
        }],
      },
    },
  },
}

const fixture = `<!doctype html><meta charset="utf-8">
<article><a href="/demo/status/42"><time datetime="2026-01-01">Today</time></a>
<div data-testid="User-Name"><a href="/demo">Demo</a></div>
<div data-testid="tweetText">Look at this <a href="${short}">example.com/real-page</a> and this <a href="${unknown}">t.co/notInTheData</a></div>
</article>
<script>
  window.runGraphql = () => fetch('/i/api/graphql/abc/HomeTimeline', { method: 'POST' }).then(response => response.json())
</script>`

;(async () => {
  const browser = await chromium.launchPersistentContext('', { channel: 'chromium', viewport: { width: 900, height: 700 },
    args: ['--load-extension=' + extension, '--disable-extensions-except=' + extension] })
  try {
    const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker')
    await worker.evaluate(() => chrome.storage.local.set({ cleanLinks: true, linkHost: 'x.com' }))
    await browser.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://x.com' })
    await browser.route('https://x.com/**', route => {
      if (route.request().url().includes('/i/api/graphql/')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) })
      return route.fulfill({ contentType: 'text/html', body: fixture })
    })
    const page = await browser.newPage()
    page.setDefaultTimeout(15000)
    await page.goto('https://x.com/home')
    await page.waitForFunction(() => document.documentElement.dataset.betterXQuiet === 'false')

    const before = await page.evaluate(link => document.querySelector(`[data-testid=tweetText] a[href="${link}"]`)?.href, short)
    assert.equal(before, short, 'X ships the shortened href first')

    await page.evaluate(() => window.runGraphql())
    await page.waitForFunction(expanded => {
      const anchor = document.querySelector('[data-testid=tweetText] a')
      return anchor?.href === expanded
    }, expanded)

    const sweep = await page.evaluate(({ short, unknown }) => {
      const anchors = [...document.querySelectorAll('[data-testid=tweetText] a')]
      return { expanded: anchors[0].getAttribute('href'), unknown: anchors[1].getAttribute('href') }
    }, { short, unknown })
    assert.equal(sweep.expanded, expanded, 'the anchor points at the real destination once the entities arrive')
    assert.equal(sweep.unknown, unknown, 'a short link without entity data is left alone')

    const clipboard = await page.evaluate(async ({ short, expanded }) => {
      await navigator.clipboard.writeText(short)
      const one = await navigator.clipboard.readText()
      await navigator.clipboard.writeText('https://x.com/demo/status/42?s=20&t=abc')
      const two = await navigator.clipboard.readText()
      return { short: one, post: two }
    }, { short, expanded })
    assert.equal(clipboard.short, expanded, 'a copied short link expands, got ' + clipboard.short)
    assert.equal(clipboard.post, 'https://x.com/demo/status/42', 'post links keep the existing cleaning')

    await page.evaluate(link => {
      const anchor = document.createElement('a')
      anchor.href = link
      anchor.textContent = 'late link'
      anchor.id = 'late'
      document.querySelector('[data-testid=tweetText]').append(anchor)
    }, short)
    await page.locator('#late').click({ button: 'right' }).catch(() => {})
    const late = await page.evaluate(expanded => {
      const anchor = document.getElementById('late')
      return anchor.getAttribute('href')
    }, expanded)
    assert.equal(late, expanded, 'a link inserted after the data still resolves, got ' + late)

    console.log('PASS: t.co links resolve to their real destination in the DOM and on the clipboard, unknown links untouched')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
