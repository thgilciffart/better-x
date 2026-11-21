const { chromium } = require('playwright-core')
const { mkdtemp } = require('node:fs/promises')
const fs = require('fs')
const extension = process.env.BETTER_X_EXTENSION || require('node:path').join(__dirname, '..', 'extension')

;(async () => {
  const dir = await mkdtemp('/tmp/bx-variant-')
  fs.cpSync(extension, dir + '/extension', { recursive: true })
  fs.rmSync(dir + '/extension/_metadata', { recursive: true, force: true })
  const context = await chromium.launchPersistentContext(await mkdtemp('/tmp/bx-p-'), { channel: 'chromium', headless: true,
    args: ['--disable-extensions-except=' + dir + '/extension', '--load-extension=' + dir + '/extension'] })
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 60000 })
  await worker.evaluate(() => new Promise(res => {
    const check = async () => (await chrome.declarativeNetRequest.getEnabledRulesets()).includes('telemetry') ? res() : setTimeout(check, 100)
    check()
  }))
  const page = await context.newPage()
  await context.route('https://x.com/**', r => r.fulfill({ json: {} }))
  await context.route('https://analytics.twitter.com/**', r => r.fulfill({ json: {} }))
  await page.goto('https://x.com/test')
  const cases = [
    ['https://x.com/i/api/1.1/graphql/user_flow.json', true],
    ['https://x.com/i/api/1.1/graphql/error_log.json', true],
    ['https://x.com/i/api/1.1/graphql/app_context.json', true],
    ['https://x.com/i/api/1.1/jot/client_event.json', true],
    ['https://x.com/1.1/jot/client_event.json', true],
    ['https://x.com/i/api/1.1/jot.json', true],
    ['https://x.com/i/api/1.1/attribution.json', true],
    ['https://x.com/i/api/1.1/flow/viewer.json', true],
    ['https://x.com/i/jot', true],
    ['https://x.com/i/csp_report', true],
    ['https://x.com/scribe/x', true],
    ['https://x.com/i/api/1.1/jot/log.json', true],
    ['https://x.com/i/api/graphql/xyz/UserTweets.json', false],
    ['https://x.com/home', false],
    ['https://analytics.twitter.com/iadsct', true],
  ]
  let fail = 0
  for (const [url, shouldBlock] of cases) {
    const blocked = await page.evaluate(async u => {
      try { await fetch(u, { method: 'POST' }); return false } catch { return true }
    }, url)
    const pass = blocked === shouldBlock
    if (!pass) fail++
    console.log((pass ? 'PASS' : 'FAIL'), url, '->', blocked ? 'blocked' : 'ok')
  }
  console.log(fail ? `FAILURES: ${fail}` : 'ALL PASS')
  await context.close()
  process.exitCode = fail ? 1 : 0
})().catch(e => { console.error(e); process.exitCode = 1 })
