importScripts('settings.js')

const { normalize } = BetterXSettings
let telemetryUpdate = Promise.resolve()

function updateTelemetry() {
  telemetryUpdate = telemetryUpdate.then(async () => {
    const { telemetry } = await chrome.storage.local.get('telemetry')
    const enabled = normalize('telemetry', telemetry)
    const active = await chrome.declarativeNetRequest.getEnabledRulesets()
    if (enabled === active.includes('telemetry')) return

    const key = enabled ? 'enableRulesetIds' : 'disableRulesetIds'
    await chrome.declarativeNetRequest.updateEnabledRulesets({ [key]: ['telemetry'] })
  }).catch(console.error)
}

chrome.runtime.onInstalled.addListener(updateTelemetry)
chrome.runtime.onStartup.addListener(updateTelemetry)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && Object.hasOwn(changes, 'telemetry')) updateTelemetry()
})

const xOrigins = new Set(['https://x.com', 'https://twitter.com'])
let creatingXeetDocument

async function renderWithXeet(message) {
  creatingXeetDocument ??= (async () => {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL('xeet.html')],
    })
    if (!contexts.length) {
      await chrome.offscreen.createDocument({
        url: 'xeet.html',
        reasons: ['BLOBS'],
        justification: 'Render and encode a PNG for the clipboard',
      })
    }
  })().finally(() => { creatingXeetDocument = undefined })
  await creatingXeetDocument
  return chrome.runtime.sendMessage({ type: 'xeet:render', post: message.post, options: message.options })
}

async function downloadMedia({ url, filename }) {
  const media = URL.canParse(url) ? new URL(url) : null
  if (!media || media.protocol !== 'https:' || media.port || media.username || media.password) {
    throw new Error('Unsupported media URL')
  }
  const photo = media.hostname === 'pbs.twimg.com' && media.pathname.startsWith('/media/')
  const video = media.hostname === 'video.twimg.com' && media.pathname.toLowerCase().endsWith('.mp4')
  if (!photo && !video) throw new Error('Unsupported media URL')
  if (typeof filename !== 'string' || !/^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,100}\.(?:jpg|jpeg|png|webp|gif|mp4|avif)$/i.test(filename)) {
    throw new Error('Unsupported media filename')
  }
  await chrome.downloads.download({ url: media.href, filename, conflictAction: 'uniquify' })
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!xOrigins.has(sender.origin) || sender.frameId !== 0) return
  if (message?.type === 'render-xeet') {
    renderWithXeet(message).then(reply, () => reply({ error: 'Xeet could not start. Reload Better X and try again.' }))
    return true
  }
  if (message?.type !== 'download') return
  downloadMedia(message).then(
    () => reply({ ok: true }),
    () => reply({ error: 'Could not start download' }),
  )
  return true
})
