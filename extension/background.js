importScripts('settings.js', 'emoji-fonts.js', 'links.js')

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
const photoMenuId = 'better-x-download-photo'
const emoji = BetterXEmojiFonts
let fontChanges = Promise.resolve()

chrome.runtime.onInstalled.addListener(async () => {
  const { downloads } = await chrome.storage.local.get('downloads')
  chrome.contextMenus.removeAll(() => chrome.contextMenus.create({
    id: photoMenuId,
    title: 'Download image',
    contexts: ['image'],
    documentUrlPatterns: ['https://x.com/*', 'https://twitter.com/*'],
    targetUrlPatterns: ['https://pbs.twimg.com/media/*'],
    visible: normalize('downloads', downloads),
  }))
})
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !Object.hasOwn(changes, 'downloads')) return
  const visible = normalize('downloads', changes.downloads.newValue)
  chrome.contextMenus.update(photoMenuId, { visible }, () => chrome.runtime.lastError)
})

chrome.contextMenus.onClicked.addListener(async info => {
  if (info.menuItemId !== photoMenuId || !URL.canParse(info.pageUrl) || !URL.canParse(info.srcUrl)) return
  if (!xOrigins.has(new URL(info.pageUrl).origin)) return
  const url = new URL(info.srcUrl)
  if (url.origin !== 'https://pbs.twimg.com' || !url.pathname.startsWith('/media/')) return
  const { downloads } = await chrome.storage.local.get('downloads')
  if (!normalize('downloads', downloads)) return
  url.pathname = url.pathname.replace(/:\w+$/, '')
  const id = url.pathname.split('/').at(-1).split('.')[0].replace(/[^\w-]/g, '').slice(0, 80)
  const format = (url.searchParams.get('format') || url.pathname.split('.').at(-1)).toLowerCase()
  const extension = /^(?:jpg|jpeg|png|webp|gif|avif)$/.test(format) ? format : 'jpg'
  url.searchParams.set('name', 'orig')
  await downloadMedia({ url: url.href, filename: `x-${id || 'photo'}.${extension}` }).catch(console.error)
})

let creatingOffscreenDocument

function ensureOffscreenDocument() {
  creatingOffscreenDocument ??= (async () => {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL('xeet.html')],
    })
    if (!contexts.length) {
      await chrome.offscreen.createDocument({
        url: 'xeet.html',
        reasons: ['BLOBS', 'CLIPBOARD'],
        justification: 'Render post images and copy page links to the clipboard',
      })
    }
  })().finally(() => { creatingOffscreenDocument = undefined })
  return creatingOffscreenDocument
}

async function renderWithXeet(message) {
  await ensureOffscreenDocument()
  return chrome.runtime.sendMessage({ type: 'xeet:render', post: message.post, options: message.options })
}

async function copyPageLink(command, tab) {
  if (command !== 'copy-page-link' || !tab?.url) return
  const { linkHost, cleanLinks } = await chrome.storage.local.get(['linkHost', 'cleanLinks'])
  const text = BetterXLinks.cleanCopiedLink(tab.url, normalize('linkHost', linkHost), normalize('cleanLinks', cleanLinks))
  await ensureOffscreenDocument()
  const { copied } = await chrome.runtime.sendMessage({ type: 'clipboard:copy-link', text })
  if (!copied) throw new Error('Could not copy the page link')
}

chrome.commands.onCommand.addListener((command, tab) => copyPageLink(command, tab).catch(console.error))

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

const fontActions = {
  'emoji-library': async () => {},
  'emoji-download': async font => {
    if (!font) throw new Error('Choose an emoji font to download.')
    await emoji.download(font)
  },
  'emoji-select': async font => {
    if (font && !await emoji.cached(font)) throw new Error('Download this font in Appearance first.')
    await chrome.storage.local.set({ emojiFont: font })
  },
  'fonts-clear': async () => {
    await chrome.storage.local.remove('emojiFont')
    await caches.delete(emoji.cacheName)
  },
}

async function fontState(includeStorage) {
  const [fonts, { emojiFont }] = await Promise.all([emoji.list(), chrome.storage.local.get('emojiFont')])
  const state = { fonts, selected: fonts[emojiFont]?.downloaded ? emojiFont : '' }
  if (includeStorage) state.storage = await chrome.storage.local.getBytesInUse(null)
  return state
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.url === chrome.runtime.getURL('popup.html') && Object.hasOwn(fontActions, message?.type)) {
    const operation = fontChanges.then(async () => {
      await fontActions[message.type](normalize('emojiFont', message.font))
      return fontState(message.storage === true)
    })
    fontChanges = operation.catch(() => {})
    operation.then(reply, error => reply({ error: error.message }))
    return true
  }
  if (!xOrigins.has(sender.origin) || sender.frameId !== 0) return
  if (message?.type === 'emoji-font') {
    const font = normalize('emojiFont', message.font)
    if (!font) return
    emoji.cached(font).then(async response => {
      if (!response) return reply({ font: null })
      reply({ font: emoji.encode(new Uint8Array(await response.arrayBuffer())) })
    })
      .catch(error => reply({ error: error.message }))
    return true
  }
  if (message?.type === 'quiet-style') {
    fetch(chrome.runtime.getURL('quiet.css')).then(response => response.text()).then(reply, () => reply(null))
    return true
  }
  if (message?.type === 'render-xeet') {
    renderWithXeet(message).then(reply, () => reply({ error: 'Xeet could not start. Reload better 𝕏 and try again.' }))
    return true
  }
  if (message?.type !== 'download') return
  downloadMedia(message).then(
    () => reply({ ok: true }),
    () => reply({ error: 'Could not start download' }),
  )
  return true
})
