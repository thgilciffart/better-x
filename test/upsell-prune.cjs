const assert = require('node:assert/strict')
const { chromium } = require('playwright-core')

const extension = process.env.BETTER_X_EXTENSION || require('node:path').join(__dirname, '..', 'extension')

const payload = {
  data: {
    home: {
      timeline: {
        instructions: [{
          type: 'TimelineAddEntries',
          entries: [
            {
              entryId: 'tweet-42',
              content: { itemContent: { tweet_results: { result: { __typename: 'Tweet', rest_id: '42', legacy: { full_text: 'a real post' } } } } },
            },
            {
              entryId: 'messageprompt-1',
              content: { itemContent: { __typename: 'TimelineMessagePrompt', messagePrompt: { cta: { text: 'upgrade to plus' } } } },
            },
            {
              entryId: 'module-prompt-2',
              content: { itemContent: { __typename: 'TimelinePrompt', prompt: { kind: 'articles' } } },
            },
            {
              entryId: 'who-to-follow-3',
              content: { itemContent: { __typename: 'TimelineUser', user_results: { result: { rest_id: '7' } } } },
            },
            { entryId: 'cursor-bottom-9', content: { cursorType: 'Bottom' } },
          ],
        }],
      },
    },
  },
}

const fixture = `<!doctype html><meta charset="utf-8">
<div data-testid="primaryColumn">
  <div role="status" aria-live="polite" id="upsell" style="background-color: rgb(2, 17, 61);">
    <div><div dir="ltr"><span>Want to publish your own Article?</span></div>
    <a href="/i/premium_sign_up" role="link"><span>Upgrade to Plus</span></a></div>
  </div>
  <div role="status" aria-live="polite" id="notice">Copied post image</div>
  <div data-testid="cellInnerDiv" id="post"><article>a real post</article><a href="/i/premium_sign_up">premium</a></div>
</div>
<script>
  window.runGraphql = () => fetch('/i/api/graphql/abc/HomeTimeline', { method: 'POST' }).then(response => response.json())
</script>`

const entries = async page => page.evaluate(async () => {
  const data = await window.runGraphql()
  return data.data.home.timeline.instructions[0].entries.map(entry => entry.entryId)
})

;(async () => {
  const browser = await chromium.launchPersistentContext('', { channel: 'chromium', viewport: { width: 900, height: 700 },
    args: ['--load-extension=' + extension, '--disable-extensions-except=' + extension] })
  try {
    const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker')
    await browser.route('https://x.com/**', route => {
      if (route.request().url().includes('/i/api/graphql/')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) })
      return route.fulfill({ contentType: 'text/html', body: fixture })
    })
    const page = await browser.newPage()
    page.setDefaultTimeout(15000)

    await worker.evaluate(() => chrome.storage.local.set({ ads: true }))
    await page.goto('https://x.com/home')
    await page.waitForFunction(() => document.documentElement.dataset.betterXAds === 'true')
    const withAds = await entries(page)
    assert.deepEqual(withAds, ['tweet-42', 'who-to-follow-3', 'cursor-bottom-9'], 'prompt entries are pruned and the rest kept, got ' + JSON.stringify(withAds))

    const hidden = await page.evaluate(() => ({
      upsell: getComputedStyle(document.getElementById('upsell')).display,
      notice: getComputedStyle(document.getElementById('notice')).display,
      post: getComputedStyle(document.getElementById('post')).display,
    }))
    assert.equal(hidden.upsell, 'none', 'the article upsell card is hidden')
    assert.notEqual(hidden.notice, 'none', 'a status card without a premium link keeps showing, got ' + hidden.notice)
    assert.equal(hidden.post, 'block', 'a real post that links to premium stays, got ' + hidden.post)

    await worker.evaluate(() => chrome.storage.local.set({ ads: false }))
    await page.waitForFunction(() => document.documentElement.dataset.betterXAds === 'false')
    const withoutAds = await entries(page)
    assert.deepEqual(withoutAds, ['tweet-42', 'messageprompt-1', 'module-prompt-2', 'who-to-follow-3', 'cursor-bottom-9'], 'prompts survive when block ads is off, got ' + JSON.stringify(withoutAds))
    const shown = await page.evaluate(() => getComputedStyle(document.getElementById('upsell')).display)
    assert.notEqual(shown, 'none', 'the upsell cell shows when block ads is off')

    console.log('PASS: upgrade prompts are pruned from timelines and the article upsell card is hidden under Block ads, and left alone when it is off')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
